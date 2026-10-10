const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const scheduler = require('./services/scheduler');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false })); // Twilio webhooks
app.use(express.json({ limit: '100kb' }));

// Basic security headers
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, demoMode: config.demoMode }));
app.use('/voice', require('./routes/voice'));
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
  app.listen(config.port, () => {
    console.log(`\n🌼 Amma Check-in running on http://localhost:${config.port}`);
    console.log(config.demoMode
      ? '   DEMO MODE: no Twilio keys, so calls are simulated. Run `npm run seed` and open the dashboard link it prints.'
      : `   LIVE MODE: calls go out via Twilio. Webhooks: ${config.publicUrl}/voice/*`);
    scheduler.start();
  });
  const shutdown = () => { db.flush(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
