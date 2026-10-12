const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const scheduler = require('./services/scheduler');
const whatsapp = require('./providers/whatsapp');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false })); // Twilio webhooks
// Keep the raw bytes too: Meta signs the exact body of its webhooks.
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// Basic security headers
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, demoMode: config.demoMode }));
app.use('/voice', require('./routes/voice'));
app.use('/whatsapp', require('./routes/whatsapp'));
// Family voice clips. Names are random 128-bit tokens, so only links we hand out (to Twilio and the dashboard) work.
app.get('/audio/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.wav$/.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(config.audioDir, req.params.file), { maxAge: '7d', immutable: true, headers: { 'Content-Type': 'audio/wav' } }, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});
app.use('/api', require('./routes/api'));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (require.main === module) {
  db.load(); // fail now, loudly, if the data file is unreadable (never start empty over it)
  app.listen(config.port, () => {
    console.log(`\n🌼 Amma Check-in running on http://localhost:${config.port}`);
    console.log(config.demoMode
      ? '   DEMO MODE: no Twilio keys, so calls are simulated. Run `npm run seed` and open the dashboard link it prints.'
      : `   LIVE MODE: calls go out via Twilio. Webhooks: ${config.publicUrl}/voice/*`);
    console.log(`   WhatsApp alerts: ${config.whatsapp.provider}`);
    for (const p of whatsapp.problems()) console.warn(`   ⚠️  ${p}`);
    if (!config.demoMode && config.adminToken === 'change-me') console.warn('   ⚠️  ADMIN_TOKEN is not set, so the admin API is switched off.');
    scheduler.start();
  });
  const shutdown = () => { db.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
