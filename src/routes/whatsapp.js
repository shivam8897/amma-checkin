// WhatsApp delivery receipts. A successful send only means the provider accepted the message;
// these webhooks tell us whether it reached the phone (delivered, read) or was dropped (failed).
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const alerts = require('../services/alerts');
const voice = require('../providers/voice');

const router = express.Router();

// The two errors families will actually hit, in words they can act on.
const HINTS = {
  63016: 'Outside the 24-hour window. Set up a WhatsApp template (see README).',
  131047: 'Outside the 24-hour window. Set up a WhatsApp template (see README).',
  63003: 'This number is not on WhatsApp.',
  131026: 'This number is not on WhatsApp.',
};
const describe = (code, fallback) => [code, HINTS[code] || fallback].filter(Boolean).join(': ') || 'Not delivered';

// Twilio: StatusCallback on every message we send.
router.post('/twilio-status', (req, res) => {
  if (!voice.validSignature(req)) return res.status(403).send('Invalid signature');
  const b = req.body || {};
  const status = ['failed', 'undelivered'].includes(b.MessageStatus) ? 'failed' : b.MessageStatus;
  alerts.recordReceipt(b.MessageSid, status, status === 'failed' ? describe(b.ErrorCode, b.ErrorMessage) : null);
  res.sendStatus(204);
});

// Meta: one-time subscription check.
router.get('/meta', (req, res) => {
  const ok = config.whatsapp.metaVerifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.whatsapp.metaVerifyToken;
  if (!ok) return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
});

function validMetaSignature(req) {
  const secret = config.whatsapp.metaAppSecret;
  if (!secret || !req.rawBody) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex'));
  const given = Buffer.from(req.get('X-Hub-Signature-256') || '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// Meta: message status updates.
router.post('/meta', (req, res) => {
  if (!validMetaSignature(req)) return res.sendStatus(403);
  for (const entry of req.body?.entry || []) {
    for (const change of entry.changes || []) {
      for (const s of change.value?.statuses || []) {
        const e = s.errors?.[0];
        alerts.recordReceipt(s.id, s.status, s.status === 'failed' ? describe(e?.code, e?.title || e?.message) : null);
      }
    }
  }
  res.sendStatus(200); // anything else makes Meta retry
});

module.exports = router;
