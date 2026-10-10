// Family voices: a son or daughter records the call's lines in their own voice, and the
// parent hears them instead of the standard voice. Each voice belongs to one parent
// (the lines say "Amma" and her medicines); a parent picks one voice with `voiceId`.
//
// Lookup order for every line on a call: recorded clip → adapted clip → standard voice.
// So a half-recorded voice still gives a complete call.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const wav = require('./wav');
const clone = require('../providers/voiceClone');
const { personalLine } = require('../engine/scripts');

const MIN_SAMPLES = 3; // recorded lines needed before we can adapt the voice
const MIN_SECONDS = 10;

const LABELS = {
  greeting: 'Morning hello',
  greetingEvening: 'Evening hello',
  sosHint: 'How to ask for help',
  medYes: 'After "yes, I took it"',
  medNo: 'After "not yet"',
  meal: 'Breakfast',
  mealEvening: 'Dinner',
  mealYes: 'After "yes, I ate"',
  mealNo: 'After "not yet"',
  mood: 'How are you feeling?',
  moodGood: 'If they feel good',
  moodOkay: 'If they feel okay',
  moodUnwell: 'If they feel unwell',
  reading: 'Sugar reading',
  readingThanks: 'After the reading',
  voiceNote: 'Before your typed message',
  sosAck: 'If they press 9',
  noInput: "If they don't press anything",
  goodbye: 'Goodbye',
};

const callsThem = (voice, parent) =>
  voice.callsThem || (parent.relation && parent.relation !== 'Parent' ? parent.relation : parent.addressAs || parent.name);

const varsFor = (voice, parent) => ({ call: callsThem(voice, parent), speaker: voice.speakerName });

/** The lines this voice can record for its parent, in the order a call plays them. */
function linesFor(voice, parent) {
  const evening = (parent.schedule || []).some((s) => s.slot === 'evening');
  const meds = parent.medicines || [];
  const out = [];
  const add = (clipKey, scriptKey, essential, extra = {}, label = LABELS[scriptKey]) => out.push({ clipKey, scriptKey, essential, extra, label });

  add('greeting', 'greeting', true);
  if (evening) add('greetingEvening', 'greetingEvening', true);
  add('sosHint', 'sosHint', false);
  for (const m of meds) {
    add(`med:${m.id}`, 'med', true, { med: m.name }, evening ? `${m.name} (${m.slot === 'evening' ? 'evening' : 'morning'})` : m.name);
  }
  if (meds.length) { add('medYes', 'medYes', false); add('medNo', 'medNo', false); }
  if (parent.askMeal) {
    add('meal', 'meal', true);
    if (evening) add('mealEvening', 'mealEvening', true);
    add('mealYes', 'mealYes', false);
    add('mealNo', 'mealNo', false);
  }
  if (parent.askMood !== false) {
    add('mood', 'mood', true);
    for (const k of ['moodGood', 'moodOkay', 'moodUnwell']) add(k, k, false);
  }
  if (parent.askReading === 'sugar') { add('reading', 'reading', false); add('readingThanks', 'readingThanks', false); }
  add('voiceNote', 'voiceNote', false);
  add('sosAck', 'sosAck', false);
  add('noInput', 'noInput', false);
  add('goodbye', 'goodbye', true);
  return out;
}

/**
 * The clip to play for a line, or null to use the standard voice.
 * A medicine clip only counts while the medicine keeps the name it was recorded with;
 * an adapted clip only counts while its text is still current.
 */
function clipFor(voice, clipKey, expect = {}) {
  const clip = voice?.clips?.[clipKey];
  if (!clip) return null;
  if (expect.medName !== undefined && clip.medName !== undefined && clip.medName !== expect.medName) return null;
  if ((clip.source === 'adapted' || clipKey === 'note') && expect.text !== undefined && clip.text !== expect.text) return null;
  return clip;
}

const clipUrl = (clip) => `/audio/${clip.file}`;

/** The voice a parent hears on calls, or null for the standard voice. */
function activeVoice(parent) {
  if (!parent?.voiceId) return null;
  const voice = db.voices.get(parent.voiceId);
  return voice && voice.parentId === parent.id ? voice : null;
}

// ── Clip files ────────────────────────────────────────────
function writeFile(buf) {
  fs.mkdirSync(config.audioDir, { recursive: true });
  const file = `${crypto.randomBytes(16).toString('hex')}.wav`; // unguessable: Twilio fetches it without a login
  fs.writeFileSync(path.join(config.audioDir, file), buf);
  return file;
}
function removeFile(file) {
  if (!file) return;
  fs.rm(path.join(config.audioDir, path.basename(file)), { force: true }, () => {});
}

/** Save a clip (recorded in the dashboard, or adapted). Replaces any previous clip for that line. */
function storeClip(voiceId, clipKey, buf, meta = {}) {
  const voice = db.voices.get(voiceId);
  const info = wav.parse(buf);
  const clip = {
    file: writeFile(buf),
    durationMs: info.durationMs,
    peaks: wav.peaks(buf, info),
    source: meta.source || 'recorded',
    createdAt: new Date().toISOString(),
  };
  if (meta.medName !== undefined) clip.medName = meta.medName;
  if (meta.text !== undefined) clip.text = meta.text;
  const old = voice.clips[clipKey];
  db.voices.update(voiceId, { clips: { ...voice.clips, [clipKey]: clip } });
  if (old) removeFile(old.file);
  return clip;
}

function removeClip(voiceId, clipKey) {
  const voice = db.voices.get(voiceId);
  const { [clipKey]: old, ...rest } = voice.clips;
  if (old) removeFile(old.file);
  return db.voices.update(voiceId, { clips: rest });
}

/** Delete a voice everywhere: files, the provider's copy, and the parent's choice. */
async function removeVoice(voiceId) {
  const voice = db.voices.get(voiceId);
  if (!voice) return;
  for (const clip of Object.values(voice.clips)) removeFile(clip.file);
  if (voice.clone?.providerVoiceId && clone.enabled()) {
    await clone.deleteVoice(voice.clone.providerVoiceId).catch((e) => console.error('[voices]', e.message));
  }
  const parent = db.parents.get(voice.parentId);
  if (parent?.voiceId === voiceId) db.parents.update(parent.id, { voiceId: null });
  db.voices.remove(voiceId);
}

// ── Adaptation: fill the gaps in the family member's own voice ──
const jobs = new Map(); // voiceId → running promise (one job per voice at a time)

function setClone(voiceId, patch) {
  const voice = db.voices.get(voiceId);
  return db.voices.update(voiceId, { clone: { ...(voice.clone || {}), ...patch, updatedAt: new Date().toISOString() } });
}

/** Speak every line that has no usable clip, plus the typed message, in the adapted voice. */
async function fillGaps(voiceId) {
  let voice = db.voices.get(voiceId);
  const parent = db.parents.get(voice.parentId);
  const providerId = voice.clone.providerVoiceId;
  for (const l of linesFor(voice, parent)) {
    voice = db.voices.get(voiceId);
    const text = personalLine(parent.language, l.scriptKey, { ...varsFor(voice, parent), ...l.extra });
    if (clipFor(voice, l.clipKey, { medName: l.extra.med, text })) continue; // recorded, or still-current adapted
    storeClip(voiceId, l.clipKey, await clone.synthesize(providerId, text), { source: 'adapted', text, medName: l.extra.med });
  }
  const note = parent.voiceNoteText;
  if (note && !clipFor(db.voices.get(voiceId), 'note', { text: note })) {
    storeClip(voiceId, 'note', await clone.synthesize(providerId, note), { source: 'adapted', text: note });
  }
}

/**
 * Learn the voice from its recordings (first time, or `retrain`), then fill the gaps.
 * Returns at once; `done` resolves when the work finishes (the dashboard polls for status).
 */
function adapt(voiceId, { retrain = false } = {}) {
  if (!clone.enabled()) throw new Error('Voice adaptation is not set up on this server');
  const voice = db.voices.get(voiceId);
  const recorded = Object.values(voice.clips).filter((c) => c.source === 'recorded');
  const needsTraining = retrain || !voice.clone?.providerVoiceId;
  if (needsTraining) {
    const seconds = recorded.reduce((a, c) => a + c.durationMs, 0) / 1000;
    if (recorded.length < MIN_SAMPLES || seconds < MIN_SECONDS) {
      throw new Error(`Record at least ${MIN_SAMPLES} lines (about ${MIN_SECONDS} seconds) first, so we can learn your voice`);
    }
  }

  const previous = jobs.get(voiceId) || Promise.resolve();
  const done = previous.then(async () => {
    try {
      if (needsTraining) {
        setClone(voiceId, { status: 'training', error: null });
        const old = db.voices.get(voiceId).clone?.providerVoiceId;
        if (old) await clone.deleteVoice(old).catch(() => {});
        const fresh = db.voices.get(voiceId);
        const samples = Object.values(fresh.clips)
          .filter((c) => c.source === 'recorded')
          .map((c) => fs.readFileSync(path.join(config.audioDir, c.file)));
        const providerVoiceId = await clone.createVoice(`${fresh.speakerName} (Amma Check-in)`, samples);
        setClone(voiceId, { providerVoiceId, trainedOn: samples.length });
        // Lines adapted from the old voice model are replaced by the new one.
        for (const [key, c] of Object.entries(db.voices.get(voiceId).clips)) if (c.source === 'adapted') removeClip(voiceId, key);
      }
      setClone(voiceId, { status: 'filling', error: null });
      await fillGaps(voiceId);
      setClone(voiceId, { status: 'ready' });
    } catch (err) {
      console.error('[voices] adapt failed:', err.message);
      if (db.voices.get(voiceId)) setClone(voiceId, { status: 'failed', error: err.message });
    }
  });
  const tracked = done.finally(() => { if (jobs.get(voiceId) === tracked) jobs.delete(voiceId); });
  jobs.set(voiceId, tracked);
  return { voice: setClone(voiceId, { status: needsTraining ? 'training' : 'filling' }), done: tracked };
}

/** After settings change (new medicine, new message), adapt the new lines if the voice can. */
function refreshParent(parentId) {
  const voice = activeVoice(db.parents.get(parentId));
  if (!voice || !voice.clone?.providerVoiceId || !clone.enabled()) return null;
  return adapt(voice.id).done;
}

// ── What the dashboard sees ───────────────────────────────
function view(voice, parent) {
  const vars = varsFor(voice, parent);
  const lines = linesFor(voice, parent).map((l) => {
    const text = personalLine(parent.language, l.scriptKey, { ...vars, ...l.extra });
    const raw = voice.clips[l.clipKey];
    const clip = clipFor(voice, l.clipKey, { medName: l.extra.med, text });
    return {
      clipKey: l.clipKey,
      label: l.label,
      essential: l.essential,
      text,
      hint: parent.language === 'en' ? null : personalLine('en', l.scriptKey, { ...vars, ...l.extra }),
      clip: clip ? { url: clipUrl(clip), durationMs: clip.durationMs, peaks: clip.peaks, source: clip.source } : null,
      stale: !!raw && !clip && raw.source === 'recorded', // e.g. the medicine was renamed
    };
  });
  const recorded = lines.filter((l) => l.clip?.source === 'recorded');
  const essential = lines.filter((l) => l.essential);
  return {
    id: voice.id,
    parentId: voice.parentId,
    speakerName: voice.speakerName,
    relation: voice.relation,
    callsThem: vars.call,
    consentAt: voice.consentAt,
    createdAt: voice.createdAt,
    active: parent.voiceId === voice.id,
    clone: voice.clone || { status: 'none' },
    canAdapt: recorded.length >= MIN_SAMPLES && recorded.reduce((a, l) => a + l.clip.durationMs, 0) >= MIN_SECONDS * 1000,
    lines,
    progress: {
      essential: essential.length,
      essentialDone: essential.filter((l) => l.clip).length,
      total: lines.length,
      done: lines.filter((l) => l.clip).length,
      recorded: recorded.length,
      seconds: Math.round(recorded.reduce((a, l) => a + l.clip.durationMs, 0) / 1000),
    },
  };
}

module.exports = {
  linesFor, clipFor, clipUrl, activeVoice, varsFor, storeClip, removeClip, removeVoice,
  adapt, fillGaps, refreshParent, view, MIN_SAMPLES, MIN_SECONDS,
};
