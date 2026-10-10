// Turns events from calls into WhatsApp alerts for the family.
const db = require('../db');
const whatsapp = require('../providers/whatsapp');

// severity: urgent alerts also go to emergency contacts (neighbour, relative nearby).
const TYPES = {
  SOS:                  { severity: 'urgent', emoji: '🆘', title: (p) => `${p} pressed 9 and wants you to call` },
  NO_ANSWER:            { severity: 'urgent', emoji: '📵', title: (p) => `${p} did not answer the call` },
  UNWELL:               { severity: 'high',   emoji: '🤒', title: (p) => `${p} is not feeling well today` },
  MED_MISSED:           { severity: 'high',   emoji: '💊', title: (p, d) => `${p} has not taken ${d.med}` },
  MEAL_SKIPPED:         { severity: 'high',   emoji: '🍚', title: (p, d) => `${p} has not had ${d.meal} yet` },
  READING_OUT_OF_RANGE: { severity: 'high',   emoji: '🩸', title: (p, d) => `${p}'s sugar reading is ${d.value} mg/dL` },
  OPTED_OUT:            { severity: 'info',   emoji: '✋', title: (p) => `${p} asked us to stop the daily calls` },
};

function timeIn(tz) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function compose(type, parent, family, data) {
  const t = TYPES[type];
  const lines = [`${t.emoji} *${t.title(parent.name, data)}*`, ''];
  if (type === 'SOS') lines.push(`Please call ${parent.name} now: ${parent.phone}`);
  if (type === 'NO_ANSWER') lines.push(`We tried ${data.attempts} times. Please check on them: ${parent.phone}`);
  if (type === 'UNWELL') lines.push(`A quick call from you would mean a lot: ${parent.phone}`);
  if (type === 'MED_MISSED') lines.push(`We reminded them to take it now. You may want to follow up.`);
  if (type === 'MEAL_SKIPPED') lines.push(`We asked them to eat something now. A short call from you may help: ${parent.phone}`);
  if (type === 'READING_OUT_OF_RANGE') lines.push(`This is outside the safe range you set. Consider calling their doctor.`);
  if (type === 'OPTED_OUT') lines.push(`Calls are paused. You can turn them back on from your dashboard after talking to them.`);
  lines.push('', `${timeIn(parent.timezone || family.timezone)} · Amma Check-in`);
  return lines.join('\n');
}

/** Raise an alert for a check-in and deliver it to the right people. */
async function raise(checkin, type, data = {}) {
  const parent = db.parents.get(checkin.parentId);
  const family = db.families.get(checkin.familyId);
  const def = TYPES[type];
  const message = compose(type, parent, family, data);

  const recipients = (family.contacts || []).filter(
    (c) => c.role === 'family' || (def.severity === 'urgent' && c.role === 'emergency')
  );

  const deliveries = [];
  for (const r of recipients) {
    const res = await whatsapp.send(r.phone, message);
    deliveries.push({ to: r.phone, name: r.name, ok: res.ok });
  }

  return db.alerts.insert({
    id: db.id('alr'),
    familyId: family.id,
    parentId: parent.id,
    checkinId: checkin.id,
    type,
    severity: def.severity,
    title: def.title(parent.name, data),
    message,
    data,
    deliveries,
    acknowledged: false,
    createdAt: new Date().toISOString(),
  });
}

module.exports = { raise, compose, TYPES };
