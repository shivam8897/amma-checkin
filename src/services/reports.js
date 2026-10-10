// Weekly report + the statistics shown on the dashboard.
const db = require('../db');
const whatsapp = require('../providers/whatsapp');
const { today } = require('../engine/callFlow');

function lastNDates(n, tz, from = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(today(tz, new Date(from.getTime() - i * 86_400_000)));
  return out;
}

/** Stats for one parent over the last `days` days. */
function parentStats(parentId, days = 7, from = new Date()) {
  const parent = db.parents.get(parentId);
  const dates = lastNDates(days, parent.timezone || 'Asia/Kolkata', from);
  const checkins = db.checkins.filter((c) => c.parentId === parentId && dates.includes(c.date));

  let medsTaken = 0, medsAsked = 0;
  const moods = { good: 0, okay: 0, unwell: 0 };
  const meals = { ate: 0, skipped: 0 };
  const readings = [];
  let answered = 0, missedCalls = 0, sos = 0;

  for (const c of checkins) {
    if (['completed', 'partial'].includes(c.status)) answered++;
    if (c.status === 'no_answer') missedCalls++;
    if (c.answers.sos) sos++;
    for (const v of Object.values(c.answers.meds || {})) {
      medsAsked++;
      if (v === 'taken') medsTaken++;
    }
    if (moods[c.answers.mood] !== undefined) moods[c.answers.mood]++;
    if (meals[c.answers.meal] !== undefined) meals[c.answers.meal]++;
    if (c.answers.reading) readings.push({ date: c.date, value: c.answers.reading });
  }

  // Streak: consecutive days (ending today/yesterday) with every call answered.
  let streak = 0;
  const allDates = lastNDates(60, parent.timezone || 'Asia/Kolkata', from).reverse();
  for (const d of allDates) {
    const dayCalls = db.checkins.filter((c) => c.parentId === parentId && c.date === d);
    const isToday = d === allDates[0];
    if (!dayCalls.length || (isToday && dayCalls.some((c) => !c.completedAt))) { if (isToday) continue; break; }
    if (dayCalls.every((c) => ['completed', 'partial'].includes(c.status))) streak++;
    else break;
  }

  const timeline = dates.map((d) => {
    const dayCalls = checkins.filter((c) => c.date === d);
    let state = 'none';
    if (dayCalls.length) {
      const bad = dayCalls.some((c) => c.status === 'no_answer' || c.answers.sos || c.answers.mood === 'unwell' || c.answers.meal === 'skipped' || Object.values(c.answers.meds).includes('missed'));
      const pending = dayCalls.some((c) => !c.completedAt);
      state = bad ? 'alert' : pending ? 'pending' : 'ok';
    }
    return { date: d, state, mood: dayCalls.find((c) => c.answers.mood)?.answers.mood || null };
  });

  return {
    parentId,
    days,
    callsPlaced: checkins.length,
    answered,
    missedCalls,
    sos,
    adherence: medsAsked ? Math.round((medsTaken / medsAsked) * 100) : null,
    medsTaken,
    medsAsked,
    moods,
    meals,
    readings,
    streak,
    timeline,
  };
}

function composeWeekly(family, from = new Date()) {
  const parents = db.parents.filter((p) => p.familyId === family.id);
  const lines = [`🌼 *Weekly update for ${family.childName}*`, ''];
  for (const p of parents) {
    const s = parentStats(p.id, 7, from);
    lines.push(`*${p.name}*`);
    lines.push(`📞 Answered ${s.answered} of ${s.callsPlaced} calls${s.missedCalls ? ` (${s.missedCalls} missed)` : ''}`);
    if (s.adherence !== null) lines.push(`💊 Medicines taken: ${s.adherence}% (${s.medsTaken}/${s.medsAsked})`);
    if (s.meals.ate + s.meals.skipped) lines.push(`🍚 Had their meal on time: ${s.meals.ate} of ${s.meals.ate + s.meals.skipped} calls`);
    lines.push(`🙂 Felt good ${s.moods.good} days · okay ${s.moods.okay} · unwell ${s.moods.unwell}`);
    if (s.readings.length) {
      const avg = Math.round(s.readings.reduce((a, r) => a + r.value, 0) / s.readings.length);
      lines.push(`🩸 Avg sugar: ${avg} mg/dL (${s.readings.length} readings)`);
    }
    if (s.streak > 1) lines.push(`🔥 ${s.streak}-day streak`);
    if (s.moods.unwell >= 2) lines.push(`💛 Felt unwell more than once. Maybe a longer call this weekend?`);
    lines.push('');
  }
  lines.push('See every day in detail on your dashboard.');
  return lines.join('\n');
}

async function sendWeekly(familyId, from = new Date()) {
  const family = db.families.get(familyId);
  const body = composeWeekly(family, from);
  for (const c of (family.contacts || []).filter((c) => c.role === 'family')) await whatsapp.send(c.phone, body);
  db.families.update(familyId, { lastReportAt: new Date().toISOString() });
  return body;
}

module.exports = { parentStats, composeWeekly, sendWeekly };
