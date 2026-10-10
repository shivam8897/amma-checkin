// JSON API used by the landing page and the family dashboard.
const express = require('express');
const db = require('../db');
const config = require('../config');
const engine = require('../engine/callFlow');
const calls = require('../services/calls');
const reports = require('../services/reports');
const scheduler = require('../services/scheduler');
const voices = require('../services/voices');
const voiceClone = require('../providers/voiceClone');
const { LANGUAGES, line } = require('../engine/scripts');

const router = express.Router();

const PLANS = {
  solo:   { name: 'One parent',  inr: 499, usd: 12 },
  couple: { name: 'Both parents', inr: 799, usd: 19 },
  care:   { name: 'Care+ (morning & evening)', inr: 999, usd: 24 },
};

// How each language's call begins, for the language picker.
const SAMPLES = Object.fromEntries(Object.keys(LANGUAGES).map((k) => [k, line(k, 'greeting', { name: 'Amma', child: 'Ravi' })]));

const PHONE = /^\+\d{8,15}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s, max = 80) => String(s ?? '').trim().slice(0, max);

function bad(res, msg) { return res.status(400).json({ error: msg }); }

// ── Auth: every family has a secret dashboard key (swap for phone OTP later) ──
function requireFamily(req, res, next) {
  const key = req.get('x-family-key') || req.query.key;
  const family = key && db.families.find((f) => f.accessKey === key);
  if (!family) return res.status(401).json({ error: 'Invalid or missing family key' });
  req.family = family;
  next();
}

function ownParent(req, res, next) {
  const parent = db.parents.get(req.params.id || req.body.parentId);
  if (!parent || parent.familyId !== req.family.id) return res.status(404).json({ error: 'Parent not found' });
  req.parent = parent;
  next();
}

function normalizeMedicines(list) {
  return (list || [])
    .map((m) => (typeof m === 'string' ? { name: m } : m))
    .filter((m) => clean(m.name))
    .slice(0, 8)
    .map((m) => ({ id: m.id || db.id('med'), name: clean(m.name, 40), slot: m.slot === 'evening' ? 'evening' : 'morning' }));
}

function makeParent(familyId, p) {
  if (!clean(p.name)) throw new Error('Parent name is required');
  if (!PHONE.test(p.phone || '')) throw new Error('Parent phone must look like +919876543210');
  if (!LANGUAGES[p.language]) throw new Error('Unsupported language');
  const callTime = TIME.test(p.callTime || '') ? p.callTime : '08:30';
  const medicines = normalizeMedicines(p.medicines);
  const schedule = [{ slot: 'morning', time: callTime }];
  if (medicines.some((m) => m.slot === 'evening')) schedule.push({ slot: 'evening', time: TIME.test(p.eveningTime || '') ? p.eveningTime : '20:00' });
  return {
    id: db.id('par'),
    familyId,
    name: clean(p.name, 40),
    addressAs: clean(p.addressAs || p.name, 40),
    relation: clean(p.relation || 'Parent', 20),
    phone: p.phone,
    language: p.language,
    timezone: p.timezone || 'Asia/Kolkata',
    schedule,
    medicines,
    askMood: p.askMood !== false,
    askMeal: p.askMeal !== false,
    askReading: p.askReading === 'sugar' ? 'sugar' : 'none',
    voiceId: null,
    voiceNoteText: null,
    voiceNoteUrl: null,
    consentGiven: false,
    active: true,
    pausedUntil: null,
    createdAt: new Date().toISOString(),
  };
}

// ── Public ────────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({ demoMode: config.demoMode, voiceAdaptation: voiceClone.enabled(), languages: LANGUAGES, samples: SAMPLES, plans: PLANS });
});

router.post('/signup', (req, res) => {
  const b = req.body || {};
  if (!clean(b.childName)) return bad(res, 'Your name is required');
  if (!PHONE.test(b.childPhone || '')) return bad(res, 'Your WhatsApp number must look like +919876543210');
  if (b.emergency?.phone && !PHONE.test(b.emergency.phone)) return bad(res, 'Emergency contact phone is invalid');
  const plan = PLANS[b.plan] ? b.plan : 'solo';

  const family = {
    id: db.id('fam'),
    accessKey: db.token(),
    childName: clean(b.childName, 40),
    email: clean(b.email, 120),
    plan,
    currency: b.currency === 'usd' ? 'usd' : 'inr',
    status: 'trial',
    trialEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    timezone: b.timezone || 'Asia/Kolkata',
    contacts: [{ name: clean(b.childName, 40), phone: b.childPhone, relation: 'Child', role: 'family' }],
    createdAt: new Date().toISOString(),
  };
  if (b.emergency?.phone) {
    family.contacts.push({ name: clean(b.emergency.name || 'Emergency contact', 40), phone: b.emergency.phone, relation: clean(b.emergency.relation || 'Neighbour', 20), role: 'emergency' });
  }

  let parents;
  try {
    parents = (b.parents || [b.parent]).filter(Boolean).slice(0, 2).map((p) => makeParent(family.id, p));
    if (!parents.length) throw new Error('Add at least one parent');
  } catch (e) {
    return bad(res, e.message);
  }

  db.families.insert(family);
  parents.forEach((p) => db.parents.insert(p));

  res.status(201).json({
    familyId: family.id,
    key: family.accessKey,
    dashboardUrl: `/dashboard.html?key=${family.accessKey}`,
    paymentLink: family.currency === 'usd' ? config.paymentLinkUsd : config.paymentLinkInr,
  });
});

// ── Family dashboard ──────────────────────────────────────
router.get('/family', requireFamily, (req, res) => {
  const family = req.family;
  const parents = db.parents.filter((p) => p.familyId === family.id);
  const { accessKey, ...safeFamily } = family;
  res.json({
    demoMode: config.demoMode,
    voiceAdaptation: voiceClone.enabled(),
    languages: LANGUAGES,
    samples: SAMPLES,
    family: safeFamily,
    plan: PLANS[family.plan],
    parents: parents.map((p) => ({
      ...p,
      voices: db.voices.filter((v) => v.parentId === p.id).map((v) => voices.view(v, p)),
      stats: reports.parentStats(p.id, 14),
      recent: db.checkins
        .filter((c) => c.parentId === p.id)
        .sort((a, b) => (b.date + b.slot).localeCompare(a.date + a.slot))
        .slice(0, 14),
    })),
    alerts: db.alerts
      .filter((a) => a.familyId === family.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30),
  });
});

router.patch('/parents/:id', requireFamily, ownParent, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) patch.name = clean(b.name, 40);
  if (b.addressAs !== undefined) patch.addressAs = clean(b.addressAs, 40);
  if (b.phone !== undefined) { if (!PHONE.test(b.phone)) return bad(res, 'Invalid phone'); patch.phone = b.phone; }
  if (b.language !== undefined) { if (!LANGUAGES[b.language]) return bad(res, 'Unsupported language'); patch.language = b.language; }
  if (b.medicines !== undefined) patch.medicines = normalizeMedicines(b.medicines);
  if (b.askMood !== undefined) patch.askMood = !!b.askMood;
  if (b.askMeal !== undefined) patch.askMeal = !!b.askMeal;
  if (b.voiceId !== undefined) {
    const v = b.voiceId && db.voices.get(b.voiceId);
    if (b.voiceId && (!v || v.parentId !== req.parent.id)) return bad(res, 'Unknown voice');
    patch.voiceId = v ? v.id : null;
  }
  if (b.askReading !== undefined) patch.askReading = b.askReading === 'sugar' ? 'sugar' : 'none';
  if (b.pausedUntil !== undefined) patch.pausedUntil = b.pausedUntil || null;
  if (b.active !== undefined) patch.active = !!b.active;
  if (b.voiceNoteText !== undefined) { patch.voiceNoteText = clean(b.voiceNoteText, 300) || null; patch.voiceNotePlayedAt = null; }
  if (b.voiceNoteUrl !== undefined) { patch.voiceNoteUrl = /^https:\/\//.test(b.voiceNoteUrl) ? b.voiceNoteUrl : null; patch.voiceNotePlayedAt = null; }
  if (b.callTime !== undefined || b.eveningTime !== undefined || patch.medicines) {
    const meds = patch.medicines || req.parent.medicines;
    const morning = TIME.test(b.callTime || '') ? b.callTime : req.parent.schedule[0]?.time || '08:30';
    const prevEvening = req.parent.schedule.find((s) => s.slot === 'evening')?.time;
    const evening = TIME.test(b.eveningTime || '') ? b.eveningTime : prevEvening || '20:00';
    patch.schedule = [{ slot: 'morning', time: morning }];
    if (meds.some((m) => m.slot === 'evening')) patch.schedule.push({ slot: 'evening', time: evening });
  }
  const updated = db.parents.update(req.parent.id, patch);
  // New medicine or message? Speak it in the family voice too (when adaptation is set up).
  if (patch.medicines || patch.voiceNoteText !== undefined || patch.askMeal !== undefined || patch.voiceId) {
    voices.refreshParent(updated.id)?.catch(() => {});
  }
  res.json(updated);
});

router.patch('/family/contacts', requireFamily, (req, res) => {
  const contacts = (req.body.contacts || []).slice(0, 6);
  for (const c of contacts) if (!PHONE.test(c.phone || '')) return bad(res, `Invalid phone for ${c.name || 'contact'}`);
  const list = contacts.map((c) => ({ name: clean(c.name, 40), phone: c.phone, relation: clean(c.relation, 20), role: c.role === 'emergency' ? 'emergency' : 'family' }));
  if (!list.some((c) => c.role === 'family')) return bad(res, 'Keep at least one family member');
  res.json(db.families.update(req.family.id, { contacts: list }).contacts);
});

router.post('/alerts/:id/ack', requireFamily, (req, res) => {
  const alert = db.alerts.get(req.params.id);
  if (!alert || alert.familyId !== req.family.id) return res.status(404).json({ error: 'Not found' });
  res.json(db.alerts.update(alert.id, { acknowledged: true, acknowledgedAt: new Date().toISOString() }));
});

router.get('/report', requireFamily, (req, res) => {
  res.json({ text: reports.composeWeekly(req.family) });
});

// Ring the parent right now (real call when Twilio is configured).
router.post('/parents/:id/call-now', requireFamily, ownParent, async (req, res) => {
  const slot = req.parent.schedule[0]?.slot || 'morning';
  let checkin = calls.findOrCreateCheckin(req.parent, slot);
  if (checkin.completedAt) {
    db.checkins.remove(checkin.id);
    checkin = calls.findOrCreateCheckin(req.parent, slot);
  }
  res.json({ checkinId: checkin.id, ...(await calls.dial(checkin)) });
});

// ── Phone simulator (same engine as real calls) ───────────
router.post('/simulate/start', requireFamily, ownParent, (req, res) => {
  const slot = req.body.slot === 'evening' ? 'evening' : 'morning';
  let checkin = calls.findOrCreateCheckin(req.parent, slot);
  if (checkin.completedAt || checkin.answeredAt) {
    db.checkins.remove(checkin.id); // re-run today's call
    checkin = calls.findOrCreateCheckin(req.parent, slot);
  }
  db.checkins.update(checkin.id, { attempts: 1, simulated: true });
  res.json({ checkinId: checkin.id, render: engine.start(checkin.id) });
});

router.post('/simulate/answer', requireFamily, async (req, res) => {
  const checkin = db.checkins.get(req.body.checkinId);
  if (!checkin || checkin.familyId !== req.family.id) return res.status(404).json({ error: 'Call not found' });
  res.json({ render: await engine.answer(checkin.id, Number(req.body.step), String(req.body.digits ?? '')) });
});

router.post('/simulate/hangup', requireFamily, async (req, res) => {
  const checkin = db.checkins.get(req.body.checkinId);
  if (!checkin || checkin.familyId !== req.family.id) return res.status(404).json({ error: 'Call not found' });
  res.json(await calls.callEnded(checkin.id, 'completed'));
});

router.post('/simulate/no-answer', requireFamily, ownParent, async (req, res) => {
  const slot = req.parent.schedule[0]?.slot || 'morning';
  let checkin = calls.findOrCreateCheckin(req.parent, slot);
  if (checkin.completedAt || checkin.answeredAt) {
    db.checkins.remove(checkin.id);
    checkin = calls.findOrCreateCheckin(req.parent, slot);
  }
  // Fast-forward through every attempt.
  let result = checkin;
  for (let i = checkin.attempts; i < config.maxAttempts; i++) {
    db.checkins.update(checkin.id, { attempts: i + 1 });
    db.retries.filter((r) => r.checkinId === checkin.id).forEach((r) => db.retries.remove(r.id));
    result = await calls.callEnded(checkin.id, 'no-answer');
  }
  res.json(result);
});

// ── Family voices: calls in a son's or daughter's own voice ──
function ownVoice(req, res, next) {
  const voice = db.voices.get(req.params.id);
  if (!voice || voice.familyId !== req.family.id) return res.status(404).json({ error: 'Voice not found' });
  req.voice = voice;
  req.parent = db.parents.get(voice.parentId);
  next();
}
const voiceView = (req) => voices.view(db.voices.get(req.voice.id), db.parents.get(req.voice.parentId));

router.post('/voices', requireFamily, ownParent, (req, res) => {
  const b = req.body || {};
  if (!clean(b.speakerName)) return bad(res, 'Your name is required');
  if (b.consent !== true) return bad(res, 'Please confirm this is your own voice and you agree to its use on calls');
  if (db.voices.filter((v) => v.parentId === req.parent.id).length >= 4) return bad(res, 'Up to 4 voices per parent');
  const voice = db.voices.insert({
    id: db.id('voc'),
    familyId: req.family.id,
    parentId: req.parent.id,
    speakerName: clean(b.speakerName, 40),
    relation: clean(b.relation, 20),
    callsThem: clean(b.callsThem, 30) || null,
    consentAt: new Date().toISOString(),
    clips: {},
    clone: { status: 'none' },
    createdAt: new Date().toISOString(),
  });
  res.status(201).json(voices.view(voice, req.parent));
});

router.patch('/voices/:id', requireFamily, ownVoice, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.speakerName !== undefined) { if (!clean(b.speakerName)) return bad(res, 'Name is required'); patch.speakerName = clean(b.speakerName, 40); }
  if (b.relation !== undefined) patch.relation = clean(b.relation, 20);
  if (b.callsThem !== undefined) patch.callsThem = clean(b.callsThem, 30) || null;
  db.voices.update(req.voice.id, patch);
  if (req.voice.clone?.providerVoiceId && voiceClone.enabled()) voices.adapt(req.voice.id).done.catch(() => {});
  res.json(voiceView(req));
});

router.delete('/voices/:id', requireFamily, ownVoice, async (req, res) => {
  await voices.removeVoice(req.voice.id);
  res.status(204).end();
});

// Upload one recorded line: 16-bit mono PCM WAV, made in the browser.
router.put('/voices/:id/clips/:clipKey', requireFamily, ownVoice,
  express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave'], limit: '3mb' }),
  (req, res) => {
    const line = voices.linesFor(req.voice, req.parent).find((l) => l.clipKey === req.params.clipKey);
    if (!line) return bad(res, 'Unknown line');
    try {
      voices.storeClip(req.voice.id, line.clipKey, req.body, { source: 'recorded', medName: line.extra.med });
    } catch (e) {
      return bad(res, e.message);
    }
    res.json(voiceView(req));
  });

router.delete('/voices/:id/clips/:clipKey', requireFamily, ownVoice, (req, res) => {
  voices.removeClip(req.voice.id, req.params.clipKey);
  res.json(voiceView(req));
});

// Learn the voice from the recordings and speak the remaining lines in it.
router.post('/voices/:id/adapt', requireFamily, ownVoice, (req, res) => {
  try {
    voices.adapt(req.voice.id, { retrain: !!req.body?.retrain }).done.catch(() => {});
  } catch (e) {
    return bad(res, e.message);
  }
  res.status(202).json(voiceView(req));
});

// ── Admin ─────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.get('x-admin-token') !== config.adminToken) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
router.get('/admin/families', requireAdmin, (req, res) => {
  res.json(db.families.all().map((f) => ({ ...f, parents: db.parents.filter((p) => p.familyId === f.id).length })));
});
router.post('/admin/tick', requireAdmin, async (req, res) => res.json({ placed: await scheduler.tick() }));
router.post('/admin/families/:id/status', requireAdmin, (req, res) => {
  if (!['trial', 'active', 'paused', 'cancelled'].includes(req.body.status)) return bad(res, 'Bad status');
  res.json(db.families.update(req.params.id, { status: req.body.status }));
});

module.exports = router;
