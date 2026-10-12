// Turns events from calls into WhatsApp alerts for the family.
const db = require('../db');
const config = require('../config');
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

// Sends still in flight. Alerts are saved at once and delivered in the background, so a slow
// WhatsApp API never holds up the phone call that raised them (Twilio hangs up after 15s).
const pending = new Set();
const track = (p) => {
  const t = p.catch((e) => console.error('[alerts] delivery:', e.message)).finally(() => pending.delete(t));
  pending.add(t);
  return t;
};
/** Resolves when every alert raised so far has finished sending (scripts and tests wait on this). */
const idle = () => Promise.all([...pending]);

const RETRY_MS = Number(process.env.WHATSAPP_RETRY_MS || 30_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The demo family has made-up phone numbers: never message them from a real WhatsApp account. */
const shouldDeliver = (family) => !(family.demo && config.whatsapp.provider !== 'console');

function setDelivery(alertId, i, patch) {
  const alert = db.alerts.get(alertId);
  if (!alert?.deliveries?.[i]) return;
  const deliveries = alert.deliveries.map((d, j) => (j === i ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d));
  db.alerts.update(alertId, { deliveries });
}

async function deliverOne(alertId, i, to, message) {
  let res = await whatsapp.send(to, message);
  if (!res.ok) { // one more try for a network blip or a provider hiccup
    await sleep(RETRY_MS);
    res = await whatsapp.send(to, message);
  }
  setDelivery(alertId, i, { ok: res.ok, status: res.status, id: res.id || null, error: res.error || null });
}

/** Raise an alert for a check-in and deliver it to the right people. Returns once it's saved. */
async function raise(checkin, type, data = {}, { deliver = true } = {}) {
  const parent = db.parents.get(checkin.parentId);
  const family = db.families.get(checkin.familyId);
  const def = TYPES[type];
  const message = compose(type, parent, family, data);

  const recipients = (family.contacts || []).filter(
    (c) => c.role === 'family' || (def.severity === 'urgent' && c.role === 'emergency')
  );
  const send = deliver && shouldDeliver(family);

  const alert = db.alerts.insert({
    id: db.id('alr'),
    familyId: family.id,
    parentId: parent.id,
    checkinId: checkin.id,
    type,
    severity: def.severity,
    title: def.title(parent.name, data),
    message,
    data,
    deliveries: recipients.map((r) => ({ to: r.phone, name: r.name, status: send ? 'sending' : 'skipped' })),
    acknowledged: false,
    createdAt: new Date().toISOString(),
  });
  if (send) recipients.forEach((r, i) => track(deliverOne(alert.id, i, r.phone, message)));
  return alert;
}

// Receipts can arrive out of order (read before delivered); never move backwards.
const RANK = { sending: 0, sent: 1, delivered: 2, read: 3 };

/** A delivery receipt from the provider: sent, delivered, read or failed. */
function recordReceipt(messageId, status, error) {
  if (!messageId || !(status in RANK || status === 'failed')) return false;
  for (const alert of db.alerts.all()) {
    const i = (alert.deliveries || []).findIndex((d) => d.id === messageId);
    if (i < 0) continue;
    const current = alert.deliveries[i].status;
    if (status === 'failed') setDelivery(alert.id, i, { ok: false, status, error: error || 'Not delivered' });
    else if (current !== 'failed' && RANK[status] > (RANK[current] ?? 0)) setDelivery(alert.id, i, { status });
    return true;
  }
  return false;
}

module.exports = { raise, compose, recordReceipt, shouldDeliver, idle, TYPES };
