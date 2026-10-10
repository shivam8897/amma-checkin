// Send a WhatsApp message through Twilio, Meta Cloud API, or just log it (console).
const config = require('../config');

async function sendTwilio(to, body) {
  const { accountSid, authToken, whatsappFrom } = config.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: whatsappFrom, To: `whatsapp:${to}`, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio WhatsApp ${res.status}: ${await res.text()}`);
  return (await res.json()).sid;
}

// Note: outside the 24-hour customer-service window, Meta requires an approved
// *template* message. Register templates for each alert type (see README).
async function sendMeta(to, body) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.whatsapp.metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.metaToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`Meta WhatsApp ${res.status}: ${await res.text()}`);
  return (await res.json()).messages?.[0]?.id;
}

async function send(to, body) {
  const provider = config.whatsapp.provider;
  try {
    if (provider === 'twilio') return { ok: true, id: await sendTwilio(to, body) };
    if (provider === 'meta') return { ok: true, id: await sendMeta(to, body) };
    if (process.env.NODE_ENV !== 'test') console.log(`\n📲 WhatsApp → ${to}\n${body}\n`);
    return { ok: true, id: 'console' };
  } catch (err) {
    console.error('[whatsapp] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { send };
