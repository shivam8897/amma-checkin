// Send a WhatsApp message through Twilio, Meta Cloud API, or just log it (console).
//
// WhatsApp only allows free-form text inside the 24 hours after the person last messaged us.
// Alerts usually come outside that window, so in production they must go out as an approved
// template (META_WA_TEMPLATE / TWILIO_WHATSAPP_CONTENT_SID). Both providers accept a free-form
// send outside the window and drop it later, which is why we also track delivery receipts
// (routes/whatsapp.js) instead of trusting the send call alone.
const config = require('../config');

// Template variables can't contain new lines, tabs or long runs of spaces (Meta error 132018).
const flat = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s*\n+\s*/g, ' · ').replace(/\s{4,}/g, '   ').trim().slice(0, 900) || '-';

/** Split a message into the two template variables: {{1}} title, {{2}} details. */
function templateParams(body, params = {}) {
  const [first, ...rest] = String(body).split('\n');
  return [flat(params.title ?? first), flat(params.details ?? rest.join('\n'))];
}

const signal = () => AbortSignal.timeout(config.whatsapp.timeoutMs);
const twilioFrom = () => (config.twilio.whatsappFrom.startsWith('whatsapp:') ? config.twilio.whatsappFrom : `whatsapp:${config.twilio.whatsappFrom}`);
const receiptsUrl = (path) => (config.publicUrl.startsWith('https://') ? `${config.publicUrl}${path}` : null);

async function sendTwilio(to, body, params) {
  const { accountSid, authToken } = config.twilio;
  const form = { From: twilioFrom(), To: `whatsapp:${to}` };
  if (config.whatsapp.twilioContentSid) {
    const [title, details] = templateParams(body, params);
    Object.assign(form, { ContentSid: config.whatsapp.twilioContentSid, ContentVariables: JSON.stringify({ 1: title, 2: details }) });
  } else {
    form.Body = body;
  }
  const callback = receiptsUrl('/whatsapp/twilio-status');
  if (callback) form.StatusCallback = callback;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
    signal: signal(),
  });
  if (!res.ok) throw new Error(`Twilio WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).sid;
}

async function sendMeta(to, body, params) {
  const { metaApiVersion, metaPhoneNumberId, metaToken, metaTemplate, metaTemplateLang } = config.whatsapp;
  const message = { messaging_product: 'whatsapp', to: to.replace('+', '') };
  if (metaTemplate) {
    const [title, details] = templateParams(body, params);
    Object.assign(message, {
      type: 'template',
      template: {
        name: metaTemplate,
        language: { code: metaTemplateLang },
        components: [{ type: 'body', parameters: [{ type: 'text', text: title }, { type: 'text', text: details }] }],
      },
    });
  } else {
    Object.assign(message, { type: 'text', text: { body } });
  }
  const res = await fetch(`https://graph.facebook.com/${metaApiVersion}/${metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${metaToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: signal(),
  });
  if (!res.ok) throw new Error(`Meta WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).messages?.[0]?.id;
}

/**
 * Send one message. `params` ({title, details}) fill the template when one is set up.
 * Resolves to { ok, id, status, error }; never throws. status 'sent' means the provider
 * accepted it; delivery receipts later move it to delivered / read / failed.
 */
async function send(to, body, params) {
  const provider = config.whatsapp.provider;
  try {
    if (provider === 'twilio') return { ok: true, status: 'sent', id: await sendTwilio(to, body, params) };
    if (provider === 'meta') return { ok: true, status: 'sent', id: await sendMeta(to, body, params) };
    if (process.env.NODE_ENV !== 'test') console.log(`\n📲 WhatsApp → ${to}\n${body}\n`);
    return { ok: true, status: 'sent', id: 'console' };
  } catch (err) {
    const error = err.name === 'TimeoutError' ? `${provider} did not answer within ${config.whatsapp.timeoutMs / 1000}s` : err.message;
    console.error('[whatsapp] send failed:', error);
    return { ok: false, status: 'failed', error };
  }
}

/** Settings that will stop alerts from arriving. Printed at startup. */
function problems() {
  const w = config.whatsapp;
  const out = [];
  if (!['console', 'twilio', 'meta'].includes(w.provider)) out.push(`WHATSAPP_PROVIDER="${w.provider}" is unknown; use twilio, meta or console.`);
  if (w.provider === 'twilio') {
    if (!config.twilio.accountSid || !config.twilio.authToken) out.push('WHATSAPP_PROVIDER=twilio needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    if (!w.twilioContentSid && !/14155238886/.test(config.twilio.whatsappFrom)) {
      out.push('No TWILIO_WHATSAPP_CONTENT_SID: alerts sent more than 24h after a family member last messaged you will not arrive.');
    }
  }
  if (w.provider === 'meta') {
    if (!w.metaToken || !w.metaPhoneNumberId) out.push('WHATSAPP_PROVIDER=meta needs META_WA_TOKEN and META_WA_PHONE_NUMBER_ID.');
    if (!w.metaTemplate) out.push('No META_WA_TEMPLATE: alerts sent more than 24h after a family member last messaged you will not arrive.');
  }
  if (w.provider !== 'console' && !receiptsUrl('/')) out.push('PUBLIC_URL is not https, so delivery receipts (delivered / failed) cannot reach this server.');
  return out;
}

module.exports = { send, problems, templateParams };
