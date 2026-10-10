process.env.NODE_ENV = 'test';
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.AUDIO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'amma-audio-'));

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const db = require('../src/db');
const config = require('../src/config');
const engine = require('../src/engine/callFlow');
const calls = require('../src/services/calls');
const voices = require('../src/services/voices');
const wav = require('../src/services/wav');
const clone = require('../src/providers/voiceClone');
const voiceProvider = require('../src/providers/voice');
const reports = require('../src/services/reports');

/** A short 16 kHz mono tone, standing in for a real recording. */
function toneWav(seconds = 1.5, hz = 220) {
  const n = Math.round(16000 * seconds);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / 16000) * 12000), i * 2);
  return wav.fromPcm(pcm, 16000);
}

let family, parent, voice;
const alertTypes = () => db.alerts.all().map((a) => a.type);

beforeEach(() => {
  db._reset(path.join(os.tmpdir(), `amma-voice-test-${process.pid}.json`));
  config.elevenlabs.apiKey = '';
  family = db.families.insert({
    id: 'fam_1', accessKey: 'k1', childName: 'Ravi', status: 'active', timezone: 'Asia/Kolkata',
    contacts: [{ name: 'Ravi', phone: '+14155550101', role: 'family' }],
  });
  parent = db.parents.insert({
    id: 'par_1', familyId: 'fam_1', name: 'Lakshmi', addressAs: 'Lakshmi garu', relation: 'Amma', phone: '+919900000010',
    language: 'en', timezone: 'Asia/Kolkata', schedule: [{ slot: 'morning', time: '08:30' }],
    medicines: [{ id: 'm1', name: 'Metformin', slot: 'morning' }],
    askMood: true, askMeal: true, askReading: 'none', consentGiven: true, active: true,
  });
  voice = db.voices.insert({
    id: 'voc_1', familyId: 'fam_1', parentId: 'par_1', speakerName: 'Ravi', relation: 'Son', callsThem: 'Amma',
    consentAt: new Date().toISOString(), clips: {}, clone: { status: 'none' },
  });
});

// ── Meal question ─────────────────────────────────────────
test('meal question is asked after medicines; "not yet" alerts the family', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  assert.deepEqual(c.steps.map((s) => s.type), ['med', 'meal', 'mood']);
  let r = engine.start(c.id);
  r = await engine.answer(c.id, r.step, '1'); // medicine taken
  assert.match(r.segments.at(-1).say, /breakfast/);
  r = await engine.answer(c.id, r.step, '2'); // not eaten
  assert.deepEqual(alertTypes(), ['MEAL_SKIPPED']);
  assert.match(db.alerts.all()[0].title, /has not had breakfast/);
  await engine.answer(c.id, r.step, '1');
  assert.equal(db.checkins.get(c.id).answers.meal, 'skipped');
  assert.deepEqual(reports.parentStats(parent.id, 1).meals, { ate: 0, skipped: 1 });
});

test('evening call asks about dinner', async () => {
  db.parents.update(parent.id, { schedule: [{ slot: 'morning', time: '08:30' }, { slot: 'evening', time: '20:00' }], medicines: [{ id: 'm2', name: 'Statin', slot: 'evening' }] });
  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'evening');
  let r = engine.start(c.id);
  r = await engine.answer(c.id, r.step, '1');
  assert.match(r.segments.at(-1).say, /dinner/);
});

// ── Family voice on the call ──────────────────────────────
test('recorded lines play in the family voice, with an honest intro; the rest fall back', async () => {
  voices.storeClip(voice.id, 'greeting', toneWav());
  voices.storeClip(voice.id, 'med:m1', toneWav(), { medName: 'Metformin' });
  db.parents.update(parent.id, { voiceId: voice.id });

  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  const r = engine.start(c.id);
  const [intro, greeting, sosHint, med] = r.segments;
  assert.ok(!intro.play);
  assert.match(intro.say, /recorded for you by Ravi/);
  assert.match(greeting.play, /^\/audio\/[a-f0-9]{32}\.wav$/);
  assert.equal(greeting.voice, 'Ravi');
  assert.match(greeting.say, /Good morning Amma! It's me, Ravi/);
  assert.ok(!sosHint.play, 'unrecorded line uses the standard voice');
  assert.ok(med.play);
  assert.match(med.say, /Amma, have you taken your Metformin/);

  const xml = voiceProvider.toTwiml(r, c.id);
  assert.match(xml, new RegExp(`<Play>${config.publicUrl}/audio/[a-f0-9]{32}\\.wav</Play>`));
  assert.match(xml, /<Say [^>]+>Namaste Lakshmi garu/);
});

test('without a recorded greeting there is no intro, and an unselected voice is never used', () => {
  voices.storeClip(voice.id, 'med:m1', toneWav(), { medName: 'Metformin' });
  let c = calls.findOrCreateCheckin(parent, 'morning'); // parent has not chosen the voice
  assert.ok(engine.start(c.id).segments.every((s) => !s.play));

  db.checkins.remove(c.id);
  db.parents.update(parent.id, { voiceId: voice.id });
  c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  const segs = engine.start(c.id).segments;
  assert.match(segs[0].say, /This is your morning call/);
  assert.ok(segs.at(-1).play);
});

test('renaming a medicine stops its old recording from playing', () => {
  voices.storeClip(voice.id, 'med:m1', toneWav(), { medName: 'Metformin' });
  db.parents.update(parent.id, { voiceId: voice.id, medicines: [{ id: 'm1', name: 'Glycomet', slot: 'morning' }] });
  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  const med = engine.start(c.id).segments.at(-1);
  assert.ok(!med.play);
  assert.match(med.say, /Glycomet/);
  const line = voices.view(db.voices.get(voice.id), db.parents.get(parent.id)).lines.find((l) => l.clipKey === 'med:m1');
  assert.equal(line.stale, true);
});

test('studio view lists essential lines and progress', () => {
  voices.storeClip(voice.id, 'greeting', toneWav(2));
  const v = voices.view(db.voices.get(voice.id), parent);
  const essential = v.lines.filter((l) => l.essential).map((l) => l.clipKey);
  assert.deepEqual(essential, ['greeting', 'med:m1', 'meal', 'mood', 'goodbye']);
  assert.equal(v.progress.essentialDone, 1);
  assert.equal(v.progress.seconds, 2);
  assert.equal(v.lines[0].clip.peaks.length, 56);
});

// ── WAV checks ────────────────────────────────────────────
test('only short mono 16-bit WAV recordings are accepted', () => {
  assert.throws(() => wav.parse(Buffer.from('hello')), /WAV/);
  assert.throws(() => wav.parse(toneWav(0.1)), /too short/);
  assert.throws(() => wav.parse(toneWav(31)), /longer than 30/);
  assert.equal(wav.parse(toneWav(1)).durationMs, 1000);
});

// ── Adaptation (provider stubbed) ─────────────────────────
test('adapting fills every missing line and the typed message, keeping recordings', async () => {
  config.elevenlabs.apiKey = 'test-key';
  const spoken = [];
  clone.createVoice = async (name, samples) => { assert.equal(samples.length, 3); return 'el_voice_1'; };
  clone.synthesize = async (id, text) => { assert.equal(id, 'el_voice_1'); spoken.push(text); return toneWav(1); };

  for (const k of ['greeting', 'mood', 'goodbye']) voices.storeClip(voice.id, k, toneWav(4));
  const recordedGreeting = db.voices.get(voice.id).clips.greeting.file;
  db.parents.update(parent.id, { voiceId: voice.id, voiceNoteText: 'Amma, I will visit on Sunday' });

  const { done } = voices.adapt(voice.id);
  await done;
  const v = db.voices.get(voice.id);
  assert.equal(v.clone.status, 'ready');
  assert.equal(v.clips.greeting.file, recordedGreeting, 'recorded clips are never replaced');
  assert.equal(v.clips['med:m1'].source, 'adapted');
  assert.ok(spoken.includes('Amma, have you taken your Metformin? Press 1 for yes, 2 for no.'));
  assert.ok(spoken.includes('Amma, I will visit on Sunday'));
  assert.equal(voices.view(v, db.parents.get(parent.id)).progress.done, voices.linesFor(v, parent).length);

  // The typed message is now read in Ravi's adapted voice.
  db.parents.update(parent.id, { medicines: [], askMeal: false });
  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  let r = engine.start(c.id);
  r = await engine.answer(c.id, r.step, '1');
  const note = r.segments.find((s) => s.say === 'Amma, I will visit on Sunday');
  assert.ok(note.play);
});

test('adapting needs a few recordings first', () => {
  config.elevenlabs.apiKey = 'test-key';
  voices.storeClip(voice.id, 'greeting', toneWav(2));
  assert.throws(() => voices.adapt(voice.id), /Record at least 3 lines/);
  config.elevenlabs.apiKey = '';
  assert.throws(() => voices.adapt(voice.id), /not set up/);
});

// ── HTTP API ──────────────────────────────────────────────
test('API: create a voice, upload a line, play it back, choose it, delete it', async () => {
  const app = require('../src/server');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (p, opts = {}) => fetch(base + p, { ...opts, headers: { 'x-family-key': 'k1', 'content-type': 'application/json', ...opts.headers } });
  try {
    let res = await call('/api/voices', { method: 'POST', body: JSON.stringify({ parentId: 'par_1', speakerName: 'Priya', callsThem: 'Amma' }) });
    assert.equal(res.status, 400, 'consent is required');
    res = await call('/api/voices', { method: 'POST', body: JSON.stringify({ parentId: 'par_1', speakerName: 'Priya', callsThem: 'Amma', consent: true }) });
    assert.equal(res.status, 201);
    const created = await res.json();

    res = await call(`/api/voices/${created.id}/clips/greeting`, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: toneWav(2) });
    assert.equal(res.status, 200);
    const after = await res.json();
    const url = after.lines.find((l) => l.clipKey === 'greeting').clip.url;
    assert.equal(after.progress.recorded, 1);

    res = await fetch(base + url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');

    res = await call(`/api/voices/${created.id}/clips/not-a-line`, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: toneWav(2) });
    assert.equal(res.status, 400);
    res = await call(`/api/voices/${created.id}/clips/goodbye`, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: Buffer.from('not audio') });
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/voices/${created.id}/clips/greeting`, { method: 'DELETE', headers: { 'x-family-key': 'someone-else' } });
    assert.equal(res.status, 401);

    res = await call('/api/parents/par_1', { method: 'PATCH', body: JSON.stringify({ voiceId: created.id }) });
    assert.equal((await res.json()).voiceId, created.id);
    res = await call('/api/family');
    const fam = await res.json();
    assert.equal(fam.parents[0].voices.find((v) => v.id === created.id).active, true);

    res = await call(`/api/voices/${created.id}`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    assert.equal(db.parents.get('par_1').voiceId, null);
    assert.equal((await fetch(base + url)).status, 404, 'audio file is deleted with the voice');
  } finally {
    server.close();
  }
});
