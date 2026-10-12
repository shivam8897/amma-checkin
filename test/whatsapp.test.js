// WhatsApp delivery and call recovery on a live server (Twilio + Meta configured, network stubbed).
process.env.NODE_ENV = 'test';
process.env.MAX_ATTEMPTS = '2';
process.env.TWILIO_ACCOUNT_SID = 'AC_test';
process.env.TWILIO_AUTH_TOKEN = 'secret';
process.env.TWILIO_VALIDATE_WEBHOOKS = 'false';
process.env.WHATSAPP_PROVIDER = 'meta';
process.env.META_WA_TOKEN = 't';
process.env.META_WA_PHONE_NUMBER_ID = '123';
process.env.META_WA_TEMPLATE = 'amma_alert';
process.env.META_APP_SECRET = 'appsecret';
process.env.WHATSAPP_RETRY_MS = '5';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('../src/db');
const engine = require('../src/engine/callFlow');
const calls = require('../src/services/calls');
const alerts = require('../src/services/alerts');
const scheduler = require('../src/services/scheduler');
const whatsapp = require('../src/providers/whatsapp');
const app = require('../src/server');

// Fake network: records every request; `reply` decides the answer.
let sent, reply;
global.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), body: opts.body });
  return reply(String(url), opts);
};
const ok = (json) => new Response(JSON.stringify(json), { status: 200 });

let family, parent;
beforeEach(() => {
  db._reset(path.join(os.tmpdir(), `amma-wa-test-${process.pid}.json`));
  sent = [];
  reply = (url) => (url.includes('graph.facebook.com') ? ok({ messages: [{ id: `wamid.${sent.length}` }] }) : ok({ sid: 'CA1' }));
  family = db.families.insert({
    id: 'fam_1', accessKey: 'k', childName: 'Ravi', status: 'active', timezone: 'Asia/Kolkata',
    contacts: [{ name: 'Ravi', phone: '+14155550101', role: 'family' }, { name: 'Neighbour', phone: '+919900000003', role: 'emergency' }],
  });
  parent = db.parents.insert({
    id: 'par_1', familyId: 'fam_1', name: 'Lakshmi', phone: '+919900000010', language: 'en', timezone: 'Asia/Kolkata',
    schedule: [{ slot: 'morning', time: '08:30' }], medicines: [{ id: 'm1', name: 'Metformin', slot: 'morning' }],
    askMood: true, consentGiven: true, active: true,
  });
});

test('a slow WhatsApp API does not hold up the call (Twilio hangs up after 15s)', async () => {
  reply = () => new Promise((r) => setTimeout(() => r(ok({ messages: [{ id: 'wamid.slow' }] })), 300));
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const r = engine.start(c.id);
  const t = Date.now();
  const end = await engine.answer(c.id, r.step, '9');
  assert.ok(Date.now() - t < 100, 'SOS answered without waiting for WhatsApp');
  assert.equal(end.hangup, true);
  assert.deepEqual(db.alerts.all()[0].deliveries.map((d) => d.status), ['sending', 'sending']);
  await alerts.idle();
  assert.deepEqual(db.alerts.all()[0].deliveries.map((d) => d.status), ['sent', 'sent']);
});

test('alerts go out as the approved template, with no new lines in the variables', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  await alerts.raise(c, 'SOS');
  await alerts.idle();
  const msg = JSON.parse(sent[0].body);
  assert.equal(msg.type, 'template');
  assert.equal(msg.template.name, 'amma_alert');
  const [title, details] = msg.template.components[0].parameters.map((p) => p.text);
  assert.equal(title, '🆘 Lakshmi pressed 9 and wants you to call');
  assert.match(details, /Please call Lakshmi now: \+919900000010 · .* · Amma Check-in/);
  assert.doesNotMatch(details, /\n/);
});

test('a failed send is retried once, then shown as not delivered', async () => {
  reply = () => new Response('{"error":{"message":"bad"}}', { status: 400 });
  const c = calls.findOrCreateCheckin(parent, 'morning');
  await alerts.raise(c, 'UNWELL'); // family only
  await alerts.idle();
  assert.equal(sent.length, 2);
  const d = db.alerts.all()[0].deliveries[0];
  assert.equal(d.status, 'failed');
  assert.match(d.error, /Meta WhatsApp 400/);
});

test('delivery receipts move forward only, and a failure sticks', () => {
  db.alerts.insert({ id: 'a1', familyId: 'fam_1', deliveries: [{ to: '+1', name: 'Ravi', status: 'sent', id: 'w1' }] });
  alerts.recordReceipt('w1', 'read');
  alerts.recordReceipt('w1', 'delivered'); // late, out of order
  assert.equal(db.alerts.get('a1').deliveries[0].status, 'read');
  alerts.recordReceipt('w1', 'failed', 'gone');
  alerts.recordReceipt('w1', 'delivered');
  assert.equal(db.alerts.get('a1').deliveries[0].status, 'failed');
  assert.equal(alerts.recordReceipt('unknown', 'read'), false);
});

async function withServer(fn) {
  const server = app.listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('Meta webhook: signed receipts update the alert, unsigned ones are refused', async () => {
  db.alerts.insert({ id: 'a1', familyId: 'fam_1', deliveries: [{ to: '+1', name: 'Ravi', status: 'sent', id: 'wamid.X' }] });
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex');
  const net = require('node:http');
  const post = (base, headers) => new Promise((resolve) => {
    const req = net.request(`${base}/whatsapp/meta`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end(body);
  });
  await withServer(async (base) => {
    assert.equal(await post(base, {}), 403);
    assert.equal(db.alerts.get('a1').deliveries[0].status, 'sent');
    assert.equal(await post(base, { 'x-hub-signature-256': sig }), 200);
  });
  const d = db.alerts.get('a1').deliveries[0];
  assert.equal(d.status, 'failed');
  assert.match(d.error, /24-hour window/);
});

test('a call whose end-of-call webhook never came is closed: retry, then NO_ANSWER alert', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const now = new Date('2026-01-01T00:00:00Z'); // 05:30 IST: nothing else is due
  const longAgo = new Date(now - 11 * 60_000).toISOString();
  db.checkins.update(c.id, { status: 'ringing', attempts: 1, lastAttemptAt: longAgo });
  await scheduler.tick(now);
  assert.equal(db.checkins.get(c.id).status, 'retry_scheduled');

  db.retries.all().splice(0);
  db.checkins.update(c.id, { status: 'ringing', attempts: 2, lastAttemptAt: longAgo });
  await scheduler.tick(now);
  assert.equal(db.checkins.get(c.id).status, 'no_answer');
  assert.deepEqual(db.alerts.all().map((a) => a.type), ['NO_ANSWER']);
});

test('a call stuck from hours ago is closed quietly, without ringing or alerting now', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  const now = new Date('2026-01-01T00:00:00Z');
  db.checkins.update(c.id, { status: 'ringing', attempts: 1, lastAttemptAt: new Date(now - 3 * 86_400_000).toISOString() });
  await scheduler.tick(now);
  assert.equal(db.checkins.get(c.id).status, 'no_answer');
  assert.equal(db.retries.all().length, 0);
  assert.equal(db.alerts.all().length, 0);
});

test('a call that is answered and then goes quiet is closed as partial', async () => {
  const c = calls.findOrCreateCheckin(parent, 'morning');
  engine.start(c.id);
  const now = new Date('2026-01-01T00:00:00Z');
  db.load().checkins.find((x) => x.id === c.id).updatedAt = new Date(now - 31 * 60_000).toISOString();
  await scheduler.tick(now);
  assert.equal(db.checkins.get(c.id).status, 'partial');
});

test('the demo family is never really called or messaged on a live server', async () => {
  db.families.update('fam_1', { demo: true });
  await scheduler.tick(new Date('2026-01-01T03:00:00Z')); // 08:30 IST
  assert.equal(db.checkins.all().length, 0);
  const c = calls.findOrCreateCheckin(parent, 'morning');
  assert.deepEqual(await calls.dial(c), { demo: true });
  await alerts.raise(c, 'SOS');
  await alerts.idle();
  assert.equal(sent.length, 0);
  assert.equal(db.alerts.all()[0].deliveries[0].status, 'skipped');
});

test('a damaged data file stops the server instead of being overwritten', () => {
  const file = path.join(os.tmpdir(), `amma-bad-${process.pid}.json`);
  fs.writeFileSync(file, '{"families":[{"id":"fam_keep"}],');
  db._reset(file);
  db._unload();
  assert.throws(() => db.load(), /not valid JSON/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"families":[{"id":"fam_keep"}],');
  fs.rmSync(file);
});

test('startup lists settings that would stop alerts arriving', () => {
  assert.deepEqual(whatsapp.problems().filter((p) => /template|META_WA/.test(p)), []);
  assert.ok(whatsapp.problems().some((p) => /PUBLIC_URL is not https/.test(p)));
});
