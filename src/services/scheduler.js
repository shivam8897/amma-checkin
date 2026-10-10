// Runs every minute: places due calls, retries, and sends Sunday reports.
const db = require('../db');
const calls = require('./calls');
const reports = require('./reports');
const { today } = require('../engine/callFlow');

function nowIn(tz, date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { hhmm: `${parts.hour}:${parts.minute}`, weekday: parts.weekday };
}

function isPaused(parent, date) {
  if (parent.active === false) return true;
  if (parent.pausedUntil && parent.pausedUntil >= date) return true; // travelling, hospital, visiting family
  return false;
}

async function tick(date = new Date()) {
  const placed = [];

  // 1) Scheduled calls
  for (const parent of db.parents.all()) {
    const tz = parent.timezone || 'Asia/Kolkata';
    const localDate = today(tz, date);
    if (isPaused(parent, localDate)) continue;
    const family = db.families.get(parent.familyId);
    if (!family || !['trial', 'active'].includes(family.status)) continue;

    const { hhmm } = nowIn(tz, date);
    for (const slot of parent.schedule || []) {
      if (slot.time !== hhmm) continue;
      const checkin = calls.findOrCreateCheckin(parent, slot.slot, localDate);
      if (checkin.status === 'scheduled') {
        await calls.dial(checkin);
        placed.push(checkin.id);
      }
    }
  }

  // 2) Retries that are due
  for (const r of [...db.retries.all()]) {
    if (r.dueAt > date.toISOString()) continue;
    db.retries.remove(r.id);
    const checkin = db.checkins.get(r.checkinId);
    if (checkin && !checkin.completedAt) {
      await calls.dial(checkin);
      placed.push(checkin.id);
    }
  }

  // 3) Weekly report: Sunday 19:00 in the family's timezone
  for (const family of db.families.all()) {
    const { hhmm, weekday } = nowIn(family.timezone || 'Asia/Kolkata', date);
    if (weekday === 'Sun' && hhmm === '19:00') await reports.sendWeekly(family.id, date);
  }

  return placed;
}

function start() {
  const run = () => tick().catch((e) => console.error('[scheduler]', e));
  // Align to the start of each minute.
  setTimeout(() => { run(); setInterval(run, 60_000); }, 60_000 - (Date.now() % 60_000));
  console.log('⏰ Scheduler running (checks every minute)');
}

module.exports = { start, tick, nowIn };
