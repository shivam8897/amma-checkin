// Central configuration, read once from environment variables.
const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  adminToken: env.ADMIN_TOKEN || 'change-me',
  dataFile: env.DATA_FILE || require('path').join(__dirname, '..', 'data', 'db.json'),
  // Recorded and adapted voice clips (WAV). Served at /audio/<random-token>.wav so Twilio can <Play> them.
  audioDir: env.AUDIO_DIR || require('path').join(__dirname, '..', 'data', 'audio'),

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    callerId: env.TWILIO_CALLER_ID || '',
    whatsappFrom: env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    validateWebhooks: env.TWILIO_VALIDATE_WEBHOOKS !== 'false',
  },

  whatsapp: {
    provider: env.WHATSAPP_PROVIDER || 'console',
    metaToken: env.META_WA_TOKEN || '',
    metaPhoneNumberId: env.META_WA_PHONE_NUMBER_ID || '',
  },

  // Optional voice adaptation: learns the family member's voice from their recordings,
  // then speaks lines they haven't recorded (new medicines, typed messages) in that voice.
  elevenlabs: {
    apiKey: env.ELEVENLABS_API_KEY || '',
    model: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  },

  retryAfterMinutes: Number(env.RETRY_AFTER_MINUTES || 15),
  maxAttempts: Number(env.MAX_ATTEMPTS || 2),
  sugarLow: Number(env.SUGAR_LOW || 70),
  sugarHigh: Number(env.SUGAR_HIGH || 250),

  paymentLinkInr: env.PAYMENT_LINK_INR || '',
  paymentLinkUsd: env.PAYMENT_LINK_USD || '',
};

// Demo mode = no Twilio credentials. Calls are simulated in the dashboard.
config.demoMode = !(config.twilio.accountSid && config.twilio.authToken);

module.exports = config;
