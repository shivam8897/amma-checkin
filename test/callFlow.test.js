process.env.NODE_ENV = 'test';
process.env.MAX_ATTEMPTS = '2';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

const db = require('../src/db');
const engine = require('../src/engine/callFlow');
const calls = require('../src/services/calls');
const voice = require('../src/providers/voice');
const reports = require('../src/services/reports');
const scheduler = require('../src/services/scheduler');

let family, parent;

beforeEach(() => {
  db._reset(path.join(os.tmpdir(), `amma-test-${process.pid}.json`));
  family = db.families.insert({
    id: 'fam_1', accessKey: 'k', childName: 'Ravi', status: 'active', timezone: 'Asia/Kolkata',
    contacts: [
      { name: 'Ravi', phone: '+14155550101', role: 'family' },
      { name: 'Neighbour', phone: '+919900000003', role: 'emergency' },
    ],
  });
  parent = db.parents.insert({
    id: 'par_1', familyId: 'fam_1', name: 'Lakshmi', addressAs: 'Lakshmi garu', phone: '+919900000010',
    language: 'te', timezone: 'Asia/Kolkata', schedule: [{ slot: 'morning', time: '08:30' }],
    medicines: [{ id: 'm1', name: 'Metformin', slot: 'morning' }, { id: 'm2', name: 'BP tablet', slot: 'morning' }],
    askMood: true, askReading: 'sugar', consentGiven: true, active: true,
  });
});

const alertTypes = () => db.alerts.all().map((a) => a.type);

test('happy path: all yes, feeling good → completed, no alerts', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  let r = engine.start(c.id);
  assert.match(r.segments[0].say, /Lakshmi garu/);
  assert.match(r.segments[0].say, /Ravi/);
  r = await engine.answer(c.id, r.step, '1'); // Metformin
  r = await engine.answer(c.id, r.step, '1'); // BP
  r = await engine.answer(c.id, r.step, '1'); // mood good
  r = await engine.answer(c.id, r.step, '135'); // reading
  assert.equal(r.hangup, true);
  const done = db.checkins.get(c.id);
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.answers.meds, { m1: 'taken', m2: 'taken' });
  assert.equal(done.answers.mood, 'good');
  assert.equal(done.answers.reading, 135);
  assert.deepEqual(alertTypes(), []);
});

test('missed medicine and unwell → instant alerts to family only', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  let r = engine.start(c.id);
  r = await engine.answer(c.id, r.step, '2');
  r = await engine.answer(c.id, r.step, '1');
  r = await engine.answer(c.id, r.step, '3');
  assert.deepEqual(alertTypes(), ['MED_MISSED', 'UNWELL']);
  assert.equal(db.alerts.all()[0].deliveries.length, 1); // not the neighbour
});

test('pressing 9 triggers SOS to family AND emergency contact, and ends call', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const r0 = engine.start(c.id);
  const r = await engine.answer(c.id, r0.step, '9');
  assert.equal(r.hangup, true);
  assert.deepEqual(alertTypes(), ['SOS']);
  assert.equal(db.alerts.all()[0].deliveries.length, 2);
});

test('high sugar reading raises an alert', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  let r = engine.start(c.id);
  for (const d of ['1', '1', '1']) r = await engine.answer(c.id, r.step, d);
  await engine.answer(c.id, r.step, '310');
  assert.deepEqual(alertTypes(), ['READING_OUT_OF_RANGE']);
});

test('silence repeats the question once, then moves on', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const r0 = engine.start(c.id);
  const r1 = await engine.answer(c.id, r0.step, '');
  assert.equal(r1.step, r0.step); // repeated
  const r2 = await engine.answer(c.id, r1.step, '');
  assert.equal(r2.step, r0.step + 1); // moved on
  assert.equal(db.checkins.get(c.id).answers.meds.m1, 'no_response');
});

test('first call asks for consent; pressing 0 opts out and stops calls', async () => {
  db.parents.update(parent.id, { consentGiven: false });
  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  assert.equal(c.steps[0].type, 'consent');
  const r0 = engine.start(c.id);
  const r = await engine.answer(c.id, r0.step, '0');
  assert.equal(r.hangup, true);
  assert.equal(db.parents.get(parent.id).active, false);
  assert.deepEqual(alertTypes(), ['OPTED_OUT']);
});

test('unanswered: retry once, then NO_ANSWER alert (escalates to neighbour)', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  await calls.dial(c);
  let after = await calls.callEnded(c.id, 'no-answer');
  assert.equal(after.status, 'retry_scheduled');
  assert.equal(db.retries.all().length, 1);
  await calls.dial(db.checkins.get(c.id));
  after = await calls.callEnded(c.id, 'no-answer');
  assert.equal(after.status, 'no_answer');
  assert.deepEqual(alertTypes(), ['NO_ANSWER']);
  assert.equal(db.alerts.all()[0].deliveries.length, 2);
});

test('hanging up mid-call is recorded as partial', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const r0 = engine.start(c.id);
  await engine.answer(c.id, r0.step, '1');
  const after = await calls.callEnded(c.id, 'completed');
  assert.equal(after.status, 'partial');
});

test('child message is played once', async () => {
  db.parents.update(parent.id, { voiceNoteText: 'Amma, I will call on Sunday', askReading: 'none', medicines: [] });
  const c = calls.findOrCreateCheckin(db.parents.get(parent.id), 'morning');
  let r = engine.start(c.id);
  r = await engine.answer(c.id, r.step, '1'); // mood
  assert.ok(r.segments.some((s) => s.say === 'Amma, I will call on Sunday'));
  assert.ok(db.parents.get(parent.id).voiceNotePlayedAt);
  const next = engine.buildSteps(db.parents.get(parent.id), 'morning');
  assert.ok(!next.some((s) => s.type === 'voicenote'));
});

test('TwiML uses the right language voice and a Gather', () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const xml = voice.toTwiml(engine.start(c.id), c.id);
  assert.match(xml, /<Gather[^>]+numDigits="1"/);
  assert.match(xml, /language="te-IN"/);
  assert.match(xml, /\/voice\/answer\?ci=/);
});

test('scheduler places a call at the parent\'s local call time', async () => {
  const at = new Date('2026-10-12T03:00:00Z'); // 08:30 IST
  const placed = await scheduler.tick(at);
  assert.equal(placed.length, 1);
  assert.equal(db.checkins.get(placed[0]).status, 'ringing');
  assert.equal((await scheduler.tick(at)).length, 0); // not twice
});

test('paused parent is not called', async () => {
  db.parents.update(parent.id, { pausedUntil: '2026-12-31' });
  assert.equal((await scheduler.tick(new Date('2026-10-12T03:00:00Z'))).length, 0);
});

test('weekly report summarises adherence and mood', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  let r = engine.start(c.id);
  for (const d of ['1', '2', '1', '#']) r = await engine.answer(c.id, r.step, d);
  const text = reports.composeWeekly(family);
  assert.match(text, /Medicines taken: 50%/);
  assert.match(text, /Felt good 1/);
});

test('a repeated answer or a key pressed after the call ended raises no extra alerts', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  let r = engine.start(c.id);
  const first = r.step;
  r = await engine.answer(c.id, first, '1'); // Metformin taken
  const again = await engine.answer(c.id, first, '2'); // same question again (webhook retry, double tap)
  assert.equal(again.step, r.step, 'asks the current question again');
  assert.equal(db.checkins.get(c.id).answers.meds.m1, 'taken');
  await calls.callEnded(c.id, 'completed'); // hung up
  const late = await engine.answer(c.id, r.step, '9');
  assert.equal(late.hangup, true);
  assert.deepEqual(alertTypes(), []);
});

test('scheduler catches up on a call it missed by a few minutes, but not hours later', async () => {
  const placed = await scheduler.tick(new Date('2026-10-12T03:20:00Z')); // 08:50 IST, server was down at 08:30
  assert.equal(placed.length, 1);
  db._reset(path.join(os.tmpdir(), `amma-test-${process.pid}.json`));
  db.families.insert(family);
  db.parents.insert(parent);
  assert.equal((await scheduler.tick(new Date('2026-10-12T05:30:00Z'))).length, 0); // 11:00 IST
});

test('someone who signs up after today\'s call time is first called tomorrow', async () => {
  db.parents.update(parent.id, { createdAt: '2026-10-12T03:10:00Z' }); // signed up 08:40 IST
  assert.equal((await scheduler.tick(new Date('2026-10-12T03:11:00Z'))).length, 0);
  assert.equal((await scheduler.tick(new Date('2026-10-13T03:00:00Z'))).length, 1);
});

test('one parent with a broken timezone does not stop everyone else\'s calls', async () => {
  db.parents.insert({ ...parent, id: 'par_bad', timezone: 'Nope/Nowhere' });
  const placed = await scheduler.tick(new Date('2026-10-12T03:00:00Z'));
  assert.deepEqual(placed.map((id) => db.checkins.get(id).parentId), ['par_1']);
});

test('the Sunday report goes out once, even if 19:00 itself was missed', async () => {
  const sunday = new Date('2026-10-11T13:45:00Z'); // Sun 19:15 IST
  await scheduler.tick(sunday);
  const sentAt = db.families.get('fam_1').lastReportAt;
  assert.equal(sentAt, sunday.toISOString());
  await scheduler.tick(new Date('2026-10-11T13:50:00Z'));
  assert.equal(db.families.get('fam_1').lastReportAt, sentAt);
});

test('API rejects malformed input with a clear 400 instead of crashing', async () => {
  const app = require('../src/server');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, method = 'POST') => fetch(base + p, { method, headers: { 'x-family-key': 'k', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const original = console.error;
  console.error = () => {};
  try {
    const signup = { childName: 'A', childPhone: '+919876543210' };
    const mom = { name: 'M', phone: '+919876543211', language: 'hi' };
    for (const body of [
      { ...signup, parents: {} },
      { ...signup, parent: { ...mom, medicines: [null, 5] } },
      { ...signup, timezone: 'Mars/Base', parent: mom },
      { ...signup, parent: { ...mom, timezone: 'Nope/X' } },
    ]) {
      const res = await post('/api/signup', body);
      const expected = body.parent?.medicines ? 201 : 400; // junk medicines are dropped, the rest is refused
      assert.equal(res.status, expected, JSON.stringify(body));
    }
    assert.equal((await post('/api/parents/par_1', { medicines: 'x' }, 'PATCH')).status, 200);
    assert.equal((await post('/api/parents/par_1', { pausedUntil: 'banana' }, 'PATCH')).status, 400);
    assert.equal((await post('/api/family/contacts', { contacts: 'x' }, 'PATCH')).status, 400);
    assert.equal((await post('/api/family/contacts', { contacts: [null] }, 'PATCH')).status, 400);
  } finally {
    console.error = original;
    server.close();
  }
});

test('on a Twilio trial account, calls retry with fewer options until Twilio accepts', async () => {
  const config = require('../src/config');
  const realFetch = global.fetch;
  const realWarn = console.warn;
  const sent = [];
  Object.assign(config.twilio, { accountSid: 'AC1', authToken: 't', callerId: '+15550001111' });
  console.warn = () => {};
  global.fetch = async (url, opts) => {
    const params = Object.fromEntries(new URLSearchParams(opts.body));
    sent.push(params);
    if (params.MachineDetection || params.StatusCallback) {
      return new Response('{"code":0,"message":"Invalid or disallowed parameters provided - trial accounts have limited parameter access"}', { status: 400 });
    }
    return new Response('{"sid":"CA123"}', { status: 201 });
  };
  try {
    assert.equal(await voice.placeCall('+919900000010', 'chk_1'), 'CA123');
    assert.equal(sent.length, 3);
    assert.deepEqual(Object.keys(sent[2]).sort(), ['From', 'To', 'Url']);
  } finally {
    global.fetch = realFetch;
    console.warn = realWarn;
    Object.assign(config.twilio, { accountSid: '', authToken: '', callerId: '' });
  }
});
