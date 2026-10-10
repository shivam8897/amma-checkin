// Creates check-ins, dials parents, and handles unanswered calls (retry → alert).
const db = require('../db');
const config = require('../config');
const voice = require('../providers/voice');
const alerts = require('./alerts');
const { buildSteps, finalize, today } = require('../engine/callFlow');

function findOrCreateCheckin(parent, slot, date = today(parent.timezone)) {
  const existing = db.checkins.find((c) => c.parentId === parent.id && c.date === date && c.slot === slot);
  if (existing) return existing;
  return db.checkins.insert({
    id: db.id('chk'),
    parentId: parent.id,
    familyId: parent.familyId,
    date,
    slot,
    status: 'scheduled',
    attempts: 0,
    steps: buildSteps(parent, slot),
    answers: { meds: {}, meal: null, mood: null, reading: null, sos: false, voiceNotePlayed: false },
    createdAt: new Date().toISOString(),
  });
}

/** Ring the parent for this check-in (or just mark it "ringing" in demo mode). */
async function dial(checkin) {
  const parent = db.parents.get(checkin.parentId);
  const attempts = (checkin.attempts || 0) + 1;
  db.checkins.update(checkin.id, { status: 'ringing', attempts, lastAttemptAt: new Date().toISOString() });

  if (config.demoMode) {
    console.log(`[demo] Would call ${parent.name} (${parent.phone}) — attempt ${attempts}. Open the dashboard simulator to answer.`);
    return { demo: true };
  }
  try {
    const callSid = await voice.placeCall(parent.phone, checkin.id);
    db.checkins.update(checkin.id, { callSid });
    return { callSid };
  } catch (err) {
    console.error('[calls] dial failed:', err.message);
    return callEnded(checkin.id, 'failed');
  }
}

/** Twilio status callback (or simulator hang-up). */
async function callEnded(checkinId, callStatus, answeredBy) {
  const checkin = db.checkins.get(checkinId);
  if (!checkin || checkin.completedAt) return checkin;

  const reachedHuman = callStatus === 'completed' && checkin.answeredAt && !String(answeredBy || '').startsWith('machine');
  if (reachedHuman) return finalize(checkin, 'completed'); // hung up mid-call → "partial"

  // Not answered (no-answer / busy / failed / voicemail).
  if (checkin.attempts < config.maxAttempts) {
    const dueAt = new Date(Date.now() + config.retryAfterMinutes * 60_000).toISOString();
    db.retries.insert({ id: db.id('rty'), checkinId, dueAt });
    return db.checkins.update(checkinId, { status: 'retry_scheduled', nextAttemptAt: dueAt });
  }
  const done = finalize(checkin, 'no_answer');
  await alerts.raise(checkin, 'NO_ANSWER', { attempts: checkin.attempts });
  return done;
}

module.exports = { findOrCreateCheckin, dial, callEnded };
