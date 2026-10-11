// The heart of the product: what happens during one check-in call.
//
// The engine is provider-agnostic. It returns a "render" object:
//   { step, segments: [{say, lang} | {play, say?, voice?}], gather: {numDigits, finishOnKey, timeout} | null, hangup }
// The Twilio adapter turns that into TwiML; the dashboard simulator turns it into chat bubbles.
// So the demo you show customers runs EXACTLY the same logic as real phone calls.
//
// Family voices: if the parent has chosen a family member's voice, each line is played from
// that person's recording ({play}); any line they haven't recorded uses the standard voice.

const db = require('../db');
const config = require('../config');
const { line, personalLine } = require('./scripts');
const alerts = require('../services/alerts');
const voices = require('../services/voices');

const SOS_DIGIT = '9';

function ctx(checkin) {
  const parent = db.parents.get(checkin.parentId);
  const family = db.families.get(checkin.familyId);
  const voice = voices.activeVoice(parent);
  const vars = { name: parent.addressAs || parent.name, child: family.childName };
  if (voice) Object.assign(vars, voices.varsFor(voice, parent));
  return { parent, family, voice, lang: parent.language, vars };
}

/** Decide which questions this call should ask. */
function buildSteps(parent, slot) {
  const steps = [];
  if (!parent.consentGiven) steps.push({ type: 'consent' });
  for (const med of parent.medicines || []) {
    if ((med.slot || 'morning') === slot) steps.push({ type: 'med', medId: med.id, med: med.name });
  }
  if (parent.askMeal) steps.push({ type: 'meal', slot });
  const firstSlot = (parent.schedule?.[0]?.slot) || 'morning';
  if (parent.askMood !== false && slot === firstSlot) steps.push({ type: 'mood' });
  if (parent.askReading === 'sugar' && slot === firstSlot) steps.push({ type: 'reading' });
  // A short message from the child, played once (an mp3 link, or text spoken in the parent's language).
  if ((parent.voiceNoteUrl || parent.voiceNoteText) && !parent.voiceNotePlayedAt) {
    steps.push({ type: 'voicenote', url: parent.voiceNoteUrl || null, text: parent.voiceNoteText || null });
  }
  return steps;
}

function today(tz = 'Asia/Kolkata', date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date); // YYYY-MM-DD
}

function say(c, key, extra = {}) {
  return { say: line(c.lang, key, { ...c.vars, ...extra }), lang: c.lang };
}

/** A line in the family member's own voice when they recorded it, else the standard voice. */
function voiced(c, key, extra = {}, clipKey = key) {
  if (c.voice) {
    const text = personalLine(c.lang, key, { ...c.vars, ...extra });
    const clip = text != null && voices.clipFor(c.voice, clipKey, { medName: extra.med, text });
    if (clip) return { play: voices.clipUrl(clip), say: text, lang: c.lang, voice: c.voice.speakerName };
  }
  return say(c, key, extra);
}

const mealKey = (step) => (step.slot === 'evening' ? 'mealEvening' : 'meal');

function promptFor(c, step) {
  switch (step.type) {
    case 'consent': return { seg: say(c, 'consent'), gather: { numDigits: 1 } };
    case 'med': return { seg: voiced(c, 'med', { med: step.med }, `med:${step.medId}`), gather: { numDigits: 1 } };
    case 'meal': return { seg: voiced(c, mealKey(step)), gather: { numDigits: 1 } };
    case 'mood': return { seg: voiced(c, 'mood'), gather: { numDigits: 1 } };
    case 'reading': return { seg: voiced(c, 'reading'), gather: { numDigits: 4, finishOnKey: '#' } };
    default: return null;
  }
}

/** Render step `idx` (skipping non-interactive steps like voice notes). */
function renderFrom(checkin, idx, prefix = []) {
  const c = ctx(checkin);
  const segments = [...prefix];
  while (idx < checkin.steps.length && checkin.steps[idx].type === 'voicenote') {
    const note = checkin.steps[idx];
    segments.push(voiced(c, 'voiceNote'));
    // A typed message is read in the family member's adapted voice when we have one.
    const adapted = !note.url && note.text && voices.clipFor(c.voice, 'note', { text: note.text });
    if (note.url) segments.push({ play: note.url });
    else if (adapted) segments.push({ play: voices.clipUrl(adapted), say: note.text, lang: c.lang, voice: c.voice.speakerName });
    else segments.push({ say: note.text, lang: c.lang });
    checkin.answers.voiceNotePlayed = true;
    db.parents.update(c.parent.id, { voiceNotePlayedAt: new Date().toISOString() });
    idx++;
  }
  if (idx >= checkin.steps.length) {
    segments.push(voiced(c, 'goodbye'));
    finalize(checkin, 'completed');
    return { step: idx, segments, gather: null, hangup: true };
  }
  const p = promptFor(c, checkin.steps[idx]);
  segments.push(p.seg);
  db.checkins.update(checkin.id, { currentStep: idx });
  return { step: idx, segments, gather: { timeout: 8, ...p.gather }, hangup: false };
}

/** Called when the parent picks up. */
function start(checkinId) {
  const checkin = db.checkins.get(checkinId);
  const c = ctx(checkin);
  db.checkins.update(checkin.id, { status: 'in_progress', answeredAt: new Date().toISOString() });
  const greetingKey = checkin.slot === 'evening' ? 'greetingEvening' : 'greeting';
  const greeting = voiced(c, greetingKey);
  // Be honest with the parent: a recorded voice is introduced as a recording, not a live call.
  const intro = greeting.play ? [say(c, 'recordedIntro')] : [];
  return renderFrom(checkin, 0, [...intro, greeting, voiced(c, 'sosHint')]);
}

/** Called with the digits the parent pressed ('' = timed out). */
async function answer(checkinId, stepIdx, digits = '') {
  const checkin = db.checkins.get(checkinId);
  // Keys pressed after the call ended (a late webhook, a stray tap) must not raise alerts.
  if (checkin.completedAt) return { step: stepIdx, segments: [], gather: null, hangup: true };
  // A repeated or out-of-order answer (webhook retry, double tap): ask the current question again.
  const current = checkin.currentStep ?? 0;
  if (stepIdx !== current) return renderFrom(checkin, current);
  const c = ctx(checkin);
  const step = checkin.steps[stepIdx];
  if (!step) return renderFrom(checkin, stepIdx);
  digits = String(digits || '').trim();

  // ── SOS: 9 on any single-key question ends the call and alerts the family ──
  if (digits === SOS_DIGIT && step.type !== 'reading') {
    checkin.answers.sos = true;
    db.checkins.update(checkin.id, { answers: checkin.answers });
    await alerts.raise(checkin, 'SOS');
    finalize(checkin, 'completed');
    return { step: stepIdx, segments: [voiced(c, 'sosAck'), voiced(c, 'goodbye')], gather: null, hangup: true };
  }

  // ── No input: repeat once, then move on ──
  if (digits === '' && step.type !== 'reading') {
    checkin.repeats = checkin.repeats || {};
    checkin.repeats[stepIdx] = (checkin.repeats[stepIdx] || 0) + 1;
    if (checkin.repeats[stepIdx] <= 1) {
      db.checkins.update(checkin.id, { repeats: checkin.repeats });
      return renderFrom(checkin, stepIdx, [voiced(c, 'noInput')]);
    }
  }

  const ack = [];
  switch (step.type) {
    case 'consent':
      if (digits === '0') {
        db.parents.update(c.parent.id, { consentGiven: false, active: false, optedOutAt: new Date().toISOString() });
        await alerts.raise(checkin, 'OPTED_OUT');
        finalize(checkin, 'opted_out');
        return { step: stepIdx, segments: [say(c, 'consentNo')], gather: null, hangup: true };
      }
      if (digits === '1') db.parents.update(c.parent.id, { consentGiven: true, consentAt: new Date().toISOString() });
      break;

    case 'med': {
      const result = digits === '1' ? 'taken' : digits === '2' ? 'missed' : 'no_response';
      checkin.answers.meds[step.medId] = result;
      if (result === 'taken') ack.push(voiced(c, 'medYes'));
      if (result === 'missed') {
        ack.push(voiced(c, 'medNo'));
        await alerts.raise(checkin, 'MED_MISSED', { med: step.med });
      }
      break;
    }

    case 'meal': {
      const meal = digits === '1' ? 'ate' : digits === '2' ? 'skipped' : 'no_response';
      checkin.answers.meal = meal;
      if (meal === 'ate') ack.push(voiced(c, 'mealYes'));
      if (meal === 'skipped') {
        ack.push(voiced(c, 'mealNo'));
        await alerts.raise(checkin, 'MEAL_SKIPPED', { meal: step.slot === 'evening' ? 'dinner' : 'breakfast' });
      }
      break;
    }

    case 'mood': {
      const mood = { 1: 'good', 2: 'okay', 3: 'unwell' }[digits] || 'no_response';
      checkin.answers.mood = mood;
      if (mood === 'good') ack.push(voiced(c, 'moodGood'));
      if (mood === 'okay') ack.push(voiced(c, 'moodOkay'));
      if (mood === 'unwell') {
        ack.push(voiced(c, 'moodUnwell'));
        await alerts.raise(checkin, 'UNWELL');
      }
      break;
    }

    case 'reading': {
      const value = parseInt(digits.replace(/\D/g, ''), 10);
      if (Number.isFinite(value) && value > 0) {
        checkin.answers.reading = value;
        ack.push(voiced(c, 'readingThanks'));
        if (value < config.sugarLow || value > config.sugarHigh) {
          await alerts.raise(checkin, 'READING_OUT_OF_RANGE', { value });
        }
      }
      break;
    }
  }

  db.checkins.update(checkin.id, { answers: checkin.answers });
  return renderFrom(checkin, stepIdx + 1, ack);
}

/** Close out a check-in. Safe to call more than once. */
function finalize(checkin, status) {
  const fresh = db.checkins.get(checkin.id);
  if (fresh.completedAt) return fresh;
  // Any question we never reached counts as "no response".
  for (const s of fresh.steps) {
    if (s.type === 'med' && !fresh.answers.meds[s.medId]) fresh.answers.meds[s.medId] = 'no_response';
  }
  const unanswered = status === 'completed' && fresh.steps.some((s, i) => i > (fresh.currentStep ?? -1) && s.type !== 'voicenote');
  return db.checkins.update(checkin.id, {
    status: status === 'completed' && unanswered && !fresh.answers.sos ? 'partial' : status,
    answers: fresh.answers,
    completedAt: new Date().toISOString(),
  });
}

module.exports = { buildSteps, start, answer, finalize, today, SOS_DIGIT };
