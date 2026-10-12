// Runs every minute: places due calls, retries, and sends Sunday reports.
const db = require('../db');
const config = require('../config');
const calls = require('./calls');
const reports = require('./reports');
const { today, finalize } = require('../engine/callFlow');

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

// Twilio's end-of-call webhook can go missing (server asleep or restarting, or a trial account
// that refused the status callback). After this long without it we close the call ourselves,
// so an unanswered call still retries and still alerts the family.
const STALE_RINGING_MS = 10 * 60_000;
const STALE_CALL_MS = 30 * 60_000;
const STALE_QUIET_MS = 6 * 3_600_000;

// The server can miss a minute (restart, deploy, a sleeping free-tier host). A call that is
// due but not yet placed still goes out if we're within this many minutes of its time.
const CATCH_UP_MINUTES = 60;
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function isDue(slotTime, hhmm) {
  const late = minutes(hhmm) - minutes(slotTime);
  return late >= 0 && late < CATCH_UP_MINUTES;
}

async function tick(date = new Date()) {
  const placed = [];
  // One bad record (say, an unknown timezone) must never stop everyone else's calls.
  const safely = async (what, fn) => {
    try { await fn(); } catch (e) { console.error(`[scheduler] ${what}:`, e.message); }
  };

  // 1) Scheduled calls
  for (const parent of db.parents.all()) {
    await safely(`parent ${parent.id}`, async () => {
      const tz = parent.timezone || 'Asia/Kolkata';
      const localDate = today(tz, date);
      if (isPaused(parent, localDate)) return;
      const family = db.families.get(parent.familyId);
      if (!family || !['trial', 'active'].includes(family.status)) return;
      if (family.demo && !config.demoMode) return; // made-up numbers: never ring them for real

      const { hhmm } = nowIn(tz, date);
      for (const slot of parent.schedule || []) {
        if (!isDue(slot.time, hhmm)) continue;
        // Don't ring someone who signed up after today's call time; their first call is tomorrow.
        if (parent.createdAt && today(tz, new Date(parent.createdAt)) === localDate && nowIn(tz, new Date(parent.createdAt)).hhmm > slot.time) continue;
        const checkin = calls.findOrCreateCheckin(parent, slot.slot, localDate);
        if (checkin.status === 'scheduled') {
          await calls.dial(checkin);
          placed.push(checkin.id);
        }
      }
    });
  }

  // 2) Retries that are due
  for (const r of [...db.retries.all()]) {
    if (r.dueAt > date.toISOString()) continue;
    db.retries.remove(r.id);
    await safely(`retry ${r.checkinId}`, async () => {
      const checkin = db.checkins.get(r.checkinId);
      if (checkin && !checkin.completedAt) {
        await calls.dial(checkin);
        placed.push(checkin.id);
      }
    });
  }

  // 3) Calls we never heard back about
  if (!config.demoMode) {
    for (const c of db.checkins.filter((c) => !c.completedAt && ['ringing', 'in_progress'].includes(c.status))) {
      await safely(`stale call ${c.id}`, async () => {
        const ringing = c.status === 'ringing';
        const since = new Date((ringing ? c.lastAttemptAt : c.updatedAt || c.answeredAt) || c.createdAt);
        if (date - since < (ringing ? STALE_RINGING_MS : STALE_CALL_MS)) return;
        console.warn(`[scheduler] no end-of-call webhook for ${c.id} (${c.status}); closing it`);
        // Hours old (say, from before a long outage): close it quietly. Ringing now, or alerting
        // about it now, would be about the wrong day.
        if (date - since > STALE_QUIET_MS) return finalize(c, ringing ? 'no_answer' : 'completed');
        await calls.callEnded(c.id, ringing ? 'no-answer' : 'completed');
      });
    }
  }

  // 4) Weekly report: Sunday from 19:00 in the family's timezone, once a week
  for (const family of db.families.all()) {
    await safely(`report ${family.id}`, async () => {
      if (!['trial', 'active'].includes(family.status)) return;
      const { hhmm, weekday } = nowIn(family.timezone || 'Asia/Kolkata', date);
      if (weekday !== 'Sun' || !isDue('19:00', hhmm)) return;
      if (family.lastReportAt && date - new Date(family.lastReportAt) < 6 * 86_400_000) return;
      await reports.sendWeekly(family.id, date);
    });
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
