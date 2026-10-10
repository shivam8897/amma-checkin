// Voice provider: places outbound calls (Twilio REST API) and renders TwiML.
// To switch to Exotel/Plivo later, implement placeCall + a renderer for their XML format.
const crypto = require('crypto');
const config = require('../config');
const { voiceFor } = require('../engine/scripts');

const esc = (s) => String(s).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);

// Clips served by this app ("/audio/…") need the public URL so Twilio can fetch them.
const absolute = (url) => (url.startsWith('/') ? config.publicUrl + url : url);

/** Engine render → TwiML XML. */
function toTwiml(render, checkinId) {
  const sayXml = render.segments
    .map((s) => {
      if (s.play) return `<Play>${esc(absolute(s.play))}</Play>`;
      const v = voiceFor(s.lang);
      return `<Say language="${v.language}" voice="${v.voice}">${esc(s.say)}</Say><Pause length="1"/>`;
    })
    .join('');

  if (render.hangup || !render.gather) return `<?xml version="1.0" encoding="UTF-8"?><Response>${sayXml}<Hangup/></Response>`;

  const g = render.gather;
  const action = `${config.publicUrl}/voice/answer?ci=${checkinId}&amp;step=${render.step}`;
  const attrs = [`input="dtmf"`, `numDigits="${g.numDigits}"`, `timeout="${g.timeout || 8}"`, `action="${action}"`, `actionOnEmptyResult="true"`];
  if (g.finishOnKey) attrs.push(`finishOnKey="${g.finishOnKey}"`);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather ${attrs.join(' ')}>${sayXml}</Gather><Redirect method="POST">${action}</Redirect></Response>`;
}

/** Start an outbound call. Twilio fetches /voice/start when the parent picks up. */
async function placeCall(toPhone, checkinId) {
  const { accountSid, authToken, callerId } = config.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: toPhone,
      From: callerId,
      Url: `${config.publicUrl}/voice/start?ci=${checkinId}`,
      StatusCallback: `${config.publicUrl}/voice/status?ci=${checkinId}`,
      StatusCallbackEvent: 'completed',
      Timeout: '30', // ring for 30s (elderly people walk slowly to the phone)
      MachineDetection: 'Enable', // don't "talk" to a voicemail box
    }),
  });
  if (!res.ok) throw new Error(`Twilio call ${res.status}: ${await res.text()}`);
  return (await res.json()).sid;
}

/** Verify X-Twilio-Signature so nobody can fake webhooks. */
function validSignature(req) {
  if (!config.twilio.validateWebhooks || config.demoMode) return true;
  const signature = req.get('X-Twilio-Signature') || '';
  const url = config.publicUrl + req.originalUrl;
  const params = req.body || {};
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', config.twilio.authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { toTwiml, placeCall, validSignature };
