// Twilio webhooks. Twilio calls these URLs during a live phone call.
const express = require('express');
const db = require('../db');
const engine = require('../engine/callFlow');
const calls = require('../services/calls');
const voice = require('../providers/voice');

const router = express.Router();

router.use((req, res, next) => {
  if (!voice.validSignature(req)) return res.status(403).send('Invalid signature');
  next();
});

const sendTwiml = (res, xml) => res.type('text/xml').send(xml);
// Express 4 doesn't catch rejected promises; without this, one failed webhook crashes the server.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Parent picked up.
router.post('/start', (req, res) => {
  const checkin = db.checkins.get(req.query.ci);
  if (!checkin) return sendTwiml(res, '<Response><Hangup/></Response>');
  if (String(req.body.AnsweredBy || '').startsWith('machine')) {
    return sendTwiml(res, '<Response><Hangup/></Response>'); // voicemail → treated as unanswered
  }
  db.checkins.update(checkin.id, { callSid: req.body.CallSid || checkin.callSid });
  sendTwiml(res, voice.toTwiml(engine.start(checkin.id), checkin.id));
});

// Parent pressed keys (or timed out).
router.post('/answer', wrap(async (req, res) => {
  const checkinId = req.query.ci;
  if (!db.checkins.get(checkinId)) return sendTwiml(res, '<Response><Hangup/></Response>');
  const render = await engine.answer(checkinId, Number(req.query.step), req.body.Digits || '');
  sendTwiml(res, voice.toTwiml(render, checkinId));
}));

// Call ended (answered, no-answer, busy, failed...).
router.post('/status', wrap(async (req, res) => {
  const status = req.body.CallStatus === 'completed' ? 'completed' : req.body.CallStatus;
  await calls.callEnded(req.query.ci, status, req.body.AnsweredBy);
  res.sendStatus(204);
}));

module.exports = router;
