# 🌼 Amma Check-in

**Every morning, someone calls Amma.**

A warm, automated phone call to elderly parents every day, in their own language (Telugu, Hindi, Tamil or English). It asks whether they took their medicines and how they feel. If anything is wrong, their children get a WhatsApp alert within seconds, plus a short report every Sunday.

> Not a medical or emergency service. In an emergency in India, dial 112.

---

## Contents

1. [The problem and who pays](#1-the-problem-and-who-pays)
2. [Features](#2-features)
3. [How one call works](#3-how-one-call-works)
4. [Alerts: who gets what](#4-alerts-who-gets-what)
5. [Quick start (demo mode, 2 minutes)](#5-quick-start-demo-mode-2-minutes)
6. [Going live with real calls](#6-going-live-with-real-calls)
7. [Project structure](#7-project-structure)
8. [API reference](#8-api-reference)
9. [Data model](#9-data-model)
10. [Business: pricing, costs, first customers](#10-business-pricing-costs-first-customers)
11. [Privacy, consent and safety](#11-privacy-consent-and-safety)
12. [The weekend plan](#12-the-weekend-plan)
13. [Roadmap: what to add next](#13-roadmap-what-to-add-next)
14. [Launch checklist](#14-launch-checklist)

---

## 1. The problem and who pays

Millions of young Indians work in Bengaluru, Pune, Hyderabad, the US, the UK or the Gulf while their parents live alone back home. Every day they wonder: *Did Amma take her BP tablet? Is Nanna okay?*

Most elder-care products are **apps**, and most elderly parents **don't use apps**. But they have answered the phone every day of their lives.

| | |
|---|---|
| **Who uses it** | Parents aged 60+, any phone (landline, keypad or smartphone) |
| **Who pays** | Their children, often earning well, often abroad |
| **Why they pay** | Peace of mind. ₹499/month is a small price for not worrying |
| **Why it's different** | No app, no smartphone, no learning. Just answer and press a number |

---

## 2. Features

### ✅ Built in this MVP

**For parents (the call)**
- Daily call at a chosen time, in **Telugu, Hindi, Tamil or English**
- Addresses them the way family does ("Lakshmi garu", "Amma", "Aunty")
- **Consent on the first call**: press 1 to agree, 0 to stop calls forever
- **One question per medicine**: press 1 for yes, 2 for no; gentle reminder if no
- **Morning and evening calls**: evening medicines get their own short call
- **Calls in a family member's own voice** 🎙: a son or daughter records the lines once in the dashboard ("Amma, have you taken your Metformin?"), and the parent hears *them* every day instead of a stranger. Each parent picks whose voice they hear. Any line not recorded uses the standard voice, so a call is never incomplete. See [Family voices](#family-voices)
- **Meal check**: "Have you had breakfast?" in the morning, "dinner?" in the evening (press 1 / 2); "not yet" alerts the family
- **Mood check**: good / okay / not well
- **Sugar reading** (optional): type the glucometer number, then #
- **Message from the child**: typed in the dashboard, read aloud once on the next call (or an mp3 link)
- **Press 9 anytime** for help (SOS)
- **Patient by design**: rings for 30 seconds, repeats a question once if there's no answer, then moves on
- **Voicemail detection**: never "talks" to an answering machine
- **Retries**: if unanswered, calls again after 15 minutes (configurable)

**For children (alerts and dashboard)**
- **Instant WhatsApp alerts** for: SOS, no answer, unwell, missed medicine, sugar out of range, opted out
- **Emergency contact** (neighbour or nearby relative) gets urgent alerts too
- **Multiple family members** get alerts (brother, sister)
- **Both parents** under one family, each with their own schedule and medicines
- **Sunday report** on WhatsApp at 7 pm: calls answered, medicine %, mood, sugar average, streak
- **Family dashboard**: today's status in one sentence, 14-day history, adherence %, streak, sugar chart, recent calls, alerts with "mark handled"
- **Settings**: language, call times, medicines (morning/evening), mood and sugar toggles, **pause until a date** (travelling, hospital), stop calls
- **"Call now"** button for an extra check
- **Phone simulator** in the dashboard: answer a call on a virtual keypad. It runs the *same engine* as real calls, so it's your sales demo too
- **Sign-up page** with plans, India/abroad pricing, payment link, and a consent checkbox

**Engineering**
- Works with **zero API keys** in demo mode
- Twilio voice (TwiML) + Twilio or Meta WhatsApp, behind small provider modules so you can swap in Exotel/Plivo
- Twilio **webhook signature validation**
- 23 automated tests covering the call logic, meals and family voices
- Only one dependency (Express); data in a JSON file you can later move to Postgres

### 💡 Ideas to add next
See the [Roadmap](#13-roadmap-what-to-add-next): voice answers ("I'm fine"), human-recorded voices, more languages, birthday and festival greetings, doctor appointment reminders, medicine refill reminders, BP readings, connecting the parent straight to the child's phone on SOS, and more.

---

## 3. How one call works

```
 Scheduler (every minute)
   │  is it 08:30 in the parent's timezone?
   ▼
 Place call ──► no answer / busy / voicemail ──► wait 15 min, retry
   │                                              └─► still no answer → 📵 NO_ANSWER alert
   ▼ parent picks up
 Greeting ("Namaskaram Lakshmi garu… Ravi asked us to check on you")
 "Press 9 anytime to ask your family to call you"
   │
   ├─ [first call only] Consent ─ 0 → stop calls, ✋ alert
   ├─ For each medicine: "Have you taken X?"  1 yes / 2 no → 💊 alert
   ├─ Meal: "Had your breakfast/dinner?"  1 yes / 2 no → 🍚 alert
   ├─ Mood: 1 good / 2 okay / 3 not well → 🤒 alert
   ├─ [optional] Sugar reading + # → out of range → 🩸 alert
   ├─ [if set] "Ravi has sent you a message…" (read once)
   └─ Goodbye
 At any single-key question: 9 → 🆘 SOS alert, call ends kindly
 Silence → repeat once → move on (recorded as "no response")
 Hang up early → recorded as "partial"
```

The engine (`src/engine/callFlow.js`) returns a neutral "render" object. The Twilio adapter turns it into TwiML; the dashboard turns it into chat bubbles. **The demo and real calls run identical logic.**

---

## 4. Alerts: who gets what

| Alert | When | Family | Emergency contact |
|---|---|---|---|
| 🆘 SOS | Parent pressed 9 | ✅ | ✅ |
| 📵 No answer | Missed every attempt | ✅ | ✅ |
| 🤒 Unwell | Pressed 3 on mood | ✅ | — |
| 💊 Missed medicine | Pressed 2 on a medicine | ✅ | — |
| 🍚 Meal skipped | Pressed 2 on "have you eaten?" | ✅ | — |
| 🩸 Sugar out of range | Below 70 or above 250 (configurable) | ✅ | — |
| ✋ Opted out | Pressed 0 on consent | ✅ | — |

Example message:
```
🆘 *Venkat Rao pressed 9 and wants you to call*

Please call Venkat Rao now: +9199XXXXXXXX

8:47 am · Amma Check-in
```

---

## 5. Quick start (demo mode, 2 minutes)

Requires **Node.js 22+**.

```bash
npm install
npm run seed      # creates a demo family with two weeks of history
npm start         # http://localhost:3000
```

- Landing page: **http://localhost:3000**
- Demo dashboard: **http://localhost:3000/dashboard.html?key=demo**
- Run tests: `npm test`

In demo mode (no Twilio keys), no real calls are made. Use **"Try the call"** in the dashboard: press the green button and answer with the keypad as Amma would. Alerts print in the server console (that's where WhatsApp messages would go) and appear on the dashboard.

Tip: tick **"Play sound"** in the simulator to hear the call: recorded family-voice lines play as audio, the rest use your browser's voice. Telugu/Tamil browser voices depend on your device.

### Family voices

Scroll to **"Calls in your own voice"** on the dashboard:

1. Enter your name and what you call your parent ("Amma"), and confirm it's your own voice.
2. Each line shows what to say in the parent's language (with the English meaning). Press the red mic, speak, press ■. The browser trims silence, evens out the volume and saves a small phone-quality WAV (16 kHz mono).
3. Listen back, then switch on **"Use on Amma's calls"**. Try the call on the phone simulator.

How it plays on a real call:
- A short standard-voice intro comes first ("…recorded for you by Ravi"), so the parent knows it's a recording, not a live call.
- Each line plays your recording if there is one; otherwise the standard voice. Renaming a medicine stops its old recording from playing (the studio asks you to record it again).
- **Optional voice adaptation:** set `ELEVENLABS_API_KEY` and press **"Adapt my voice"** (needs 3+ recorded lines). Your recordings teach the voice, which then speaks the lines you skipped, new medicines and your typed messages in your voice. Without a key, everything else still works.
- Clips live in `data/audio/` under random 128-bit file names (Twilio fetches them without a login). Deleting a voice deletes its files and the adapted voice at the provider.

Recording needs a secure page: `localhost` or `https://`.

---

## 6. Going live with real calls

### Step 1: Public URL
Twilio must reach your server over HTTPS.
- Development: `ngrok http 3000`, copy the `https://…` URL
- Production: deploy to Railway, Render, Fly.io or a small VPS

### Step 2: Twilio voice
1. Create a Twilio account and buy a voice-capable number
2. Copy `.env.example` to `.env` and fill in:
   ```
   PUBLIC_URL=https://your-url
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_CALLER_ID=+1xxxxxxxxxx
   ```
3. Restart. The console shows **LIVE MODE**. Use "Call now" on the dashboard to test on your own phone first.

> **Calling Indian numbers:** check your provider's current per-minute rates to India and their rules for caller ID. For production in India, providers with local presence (Exotel, Plivo, Knowlarity) often give Indian caller IDs and lower rates, and handle Indian telecom (TRAI/DLT) requirements. Add a new adapter next to `src/providers/voice.js`: implement `placeCall()` and a renderer for their XML/JSON format. The engine doesn't change.

### Step 3: WhatsApp alerts
- **Testing:** Twilio WhatsApp Sandbox. Set `WHATSAPP_PROVIDER=twilio` and have each family member join the sandbox once.
- **Production:** a WhatsApp Business number via Twilio or Meta Cloud API (`WHATSAPP_PROVIDER=meta`). Messages you start (alerts) outside a 24-hour chat window must use **pre-approved templates**, so register one template per alert type and the weekly report.

### Step 4: Voice quality (this matters most)
Default voices use Twilio's Google voices (`te-IN`, `hi-IN`, `ta-IN`, `en-IN`), set in `src/engine/scripts.js`.
- **Have a native speaker review every line** in `scripts.js` before launch.
- Names typed in English ("Lakshmi garu") may be pronounced oddly by Telugu voices. Typing them in Telugu script (లక్ష్మి గారు) sounds much better.
- **Big upgrade:** record the fixed lines in a warm human voice (a family aunt or a voice artist) as mp3 files and use `<Play>`. Parents respond far better to a human voice.

### Step 5: Payments
Create Razorpay (India) and Stripe (abroad) payment links, put them in `PAYMENT_LINK_INR` / `PAYMENT_LINK_USD`. After sign-up, customers see "Add payment". Mark families active with:
```bash
curl -X POST localhost:3000/api/admin/families/<id>/status \
  -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"status":"active"}'
```
Later: subscription webhooks that update status automatically.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Server port |
| `PUBLIC_URL` | localhost | Public HTTPS URL for Twilio webhooks |
| `ADMIN_TOKEN` | change-me | Secret for `/api/admin/*` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | empty | Empty = demo mode |
| `TWILIO_CALLER_ID` | | Number calls come from |
| `TWILIO_VALIDATE_WEBHOOKS` | true | Reject fake webhooks |
| `WHATSAPP_PROVIDER` | console | `twilio`, `meta` or `console` |
| `TWILIO_WHATSAPP_FROM` | sandbox | WhatsApp sender |
| `META_WA_TOKEN` / `META_WA_PHONE_NUMBER_ID` | | Meta Cloud API |
| `RETRY_AFTER_MINUTES` | 15 | Wait before retry |
| `MAX_ATTEMPTS` | 2 | Attempts before NO_ANSWER alert |
| `SUGAR_LOW` / `SUGAR_HIGH` | 70 / 250 | Alert thresholds (mg/dL) |
| `PAYMENT_LINK_INR` / `PAYMENT_LINK_USD` | | Shown after sign-up |
| `ELEVENLABS_API_KEY` | empty | Optional: adapt family voices to fill unrecorded lines |
| `ELEVENLABS_MODEL` | eleven_multilingual_v2 | Speech model for adapted lines |
| `AUDIO_DIR` | data/audio | Where voice clips are stored |

---

## 7. Project structure

```
amma-checkin/
├── README.md
├── package.json
├── .env.example
├── public/
│   ├── index.html          Landing page + sign-up + pricing
│   └── dashboard.html      Family dashboard + phone simulator
├── src/
│   ├── server.js           Express app, static files, startup
│   ├── config.js           All settings from environment
│   ├── db.js               Tiny JSON database (swap for Postgres later)
│   ├── engine/
│   │   ├── callFlow.js     ❤️ The call logic: steps, answers, SOS, retries
│   │   └── scripts.js      Every spoken line, in 4 languages (+ first-person lines for family voices)
│   ├── providers/
│   │   ├── voice.js        Twilio calls, TwiML, signature check
│   │   ├── whatsapp.js     Twilio / Meta / console WhatsApp
│   │   └── voiceClone.js   Optional voice adaptation (ElevenLabs)
│   ├── services/
│   │   ├── calls.js        Create check-ins, dial, handle no-answer
│   │   ├── alerts.js       Compose + deliver alerts
│   │   ├── reports.js      Stats + Sunday report
│   │   ├── voices.js       Family voices: lines, clips, fallbacks, adaptation
│   │   ├── wav.js          WAV checks + waveform peaks
│   │   └── scheduler.js    Runs every minute
│   └── routes/
│       ├── api.js          JSON API for web pages
│       └── voice.js        Twilio webhooks
├── scripts/seed.js         Demo family with 2 weeks of history
├── test/callFlow.test.js   13 tests: the call logic
├── test/voices.test.js     10 tests: meals, family voices, uploads
└── data/                   db.json and audio/ live here (git-ignored)
```

---

## 8. API reference

Family endpoints need the header `x-family-key: <key>` (or `?key=`). The key is created at sign-up and is part of the dashboard link.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/config` | Demo mode flag, languages, plans |
| POST | `/api/signup` | Create family + parent(s), returns dashboard link |
| GET | `/api/family` | Everything the dashboard shows |
| PATCH | `/api/parents/:id` | Update settings, medicines, message, pause |
| PATCH | `/api/family/contacts` | Who gets alerts |
| POST | `/api/alerts/:id/ack` | Mark an alert handled |
| GET | `/api/report` | Preview the Sunday report |
| POST | `/api/parents/:id/call-now` | Call right now |
| POST | `/api/simulate/start` · `answer` · `hangup` · `no-answer` | Phone simulator |
| POST | `/api/voices` | Create a family voice for a parent (needs `consent: true`) |
| PATCH · DELETE | `/api/voices/:id` | Rename / delete a voice (deletes its audio) |
| PUT · DELETE | `/api/voices/:id/clips/:line` | Upload (`audio/wav`) or remove one recorded line |
| POST | `/api/voices/:id/adapt` | Learn the voice and fill unrecorded lines (optional) |
| GET | `/audio/:file.wav` | Voice clip (random file names) |
| GET | `/api/admin/families` | All families (needs `x-admin-token`) |
| POST | `/api/admin/tick` | Run the scheduler once |
| POST | `/api/admin/families/:id/status` | trial / active / paused / cancelled |
| POST | `/voice/start` · `/voice/answer` · `/voice/status` | Twilio webhooks |
| GET | `/health` | Health check |

---

## 9. Data model

```
Family   { id, accessKey, childName, plan, currency, status, trialEndsAt, timezone,
           contacts: [{ name, phone, relation, role: family|emergency }] }

Parent   { id, familyId, name, addressAs, relation, phone, language, timezone,
           schedule: [{ slot: morning|evening, time: "08:30" }],
           medicines: [{ id, name, slot }], askMood, askMeal, askReading, voiceId,
           voiceNoteText, voiceNoteUrl, voiceNotePlayedAt,
           consentGiven, active, pausedUntil }

CheckIn  { id, parentId, familyId, date, slot, status, attempts, steps[],
           answers: { meds: {medId: taken|missed|no_response}, meal: ate|skipped|no_response, mood, reading, sos, voiceNotePlayed },
           answeredAt, completedAt }
           status: scheduled → ringing → in_progress → completed | partial | no_answer | opted_out
                                       ↘ retry_scheduled ↗

Alert    { id, familyId, parentId, checkinId, type, severity, title, message, deliveries[], acknowledged }

Voice    { id, familyId, parentId, speakerName, relation, callsThem, consentAt,
           clips: { [line]: { file, durationMs, peaks[], source: recorded|adapted, medName?, text? } },
           clone: { status: none|training|filling|ready|failed, providerVoiceId } }
```

---

## 10. Business: pricing, costs, first customers

### Pricing (on the landing page)

| Plan | India | Abroad | Includes |
|---|---|---|---|
| One parent | ₹499/mo | $12/mo | Daily call, alerts, Sunday report |
| Both parents | ₹799/mo | $19/mo | Separate calls for each, emergency contact |
| Care+ | ₹999/mo | $24/mo | Morning + evening, sugar tracking, messages |

7-day free trial. Charge NRIs in dollars: the value is the same, their income is higher.

### Know your cost per family
Work this out with your provider's real rates before you set final prices:
```
Monthly cost ≈ (≈30 calls × ~1 min × voice rate per minute)
             + (retries)
             + (alert + weekly WhatsApp messages × message rate)
             + hosting (small, shared across families)
```
Keep calls short (about 60 seconds) and your margin stays healthy.

### Getting the first 10 paying families
1. **Your own group.** Everyone has parents who fit. Ask: "Would you pay ₹499/month for this?"
2. **Show the simulator.** Hand someone your phone with the dashboard open and let them be "Amma". It sells itself.
3. **NRI WhatsApp and Telegram groups**, Telugu/Tamil associations abroad, LinkedIn posts with a 30-second demo video.
4. **Ask every customer for 2 referrals.** Offer a free month for each one who joins.
5. **Partners later:** clinics, diabetologists, pharmacies, senior-living communities, insurance companies.

---

## 11. Privacy, consent and safety

- **Consent from the parent**, not only the child: checkbox at sign-up *and* "press 1 to agree / 0 to stop" on the first call.
- **Health data is sensitive.** Follow India's Digital Personal Data Protection Act (DPDP) 2023: collect only what you need, say why, let families delete everything, keep data secure.
- **Never sell or share data.** Only family members the child adds can see anything.
- **Not a medical service.** Say so on the website, in the app, and in the terms. Thresholds for sugar alerts should follow the parent's doctor.
- **Secrets:** keep `.env` out of git. Change `ADMIN_TOKEN`. Leave webhook validation on.
- **Before scaling:** replace the dashboard key with phone-number OTP login, move to Postgres with backups, and add audit logs.

---

## 12. The weekend plan

**Team roles (4 people)**
- **Backend:** Twilio setup, ngrok, deploy, scheduler
- **Voice & language:** review scripts with native speakers, record better audio
- **Frontend:** polish landing page and dashboard, real copy, logo
- **Sales:** talks to 10 families, records the demo video, collects payments

**Saturday**
- [ ] Morning: ask 5 friends "would you pay ₹499/month?" (if 3 say yes, build)
- [ ] `npm install && npm run seed && npm start`, everyone tries the simulator
- [ ] Get Twilio keys + ngrok, make the first real call to your own phone
- [ ] Native speakers fix every line in `scripts.js`

**Sunday**
- [ ] WhatsApp sandbox working for alerts
- [ ] Test on your own parents for real (with their permission!)
- [ ] Deploy (Railway/Render), payment links in `.env`
- [ ] Record a 60-second demo video: Amma's call + Ravi's WhatsApp

**Monday**
- [ ] Post in family/NRI groups, aim for 10 paying families this week
- [ ] Collect feedback after every first call and improve the script

---

## 13. Roadmap: what to add next

**Better calls**
- Speak instead of press: "I'm fine", "not well" (speech recognition in Indian languages)
- ~~Human-recorded voice lines, or a familiar voice cloned *with consent*~~ ✅ Built: [Family voices](#family-voices)
- More languages: Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia
- BP readings (two numbers), weight, water intake, short walk reminders
- A friendly 2-minute chat option for loneliness ("Tell me about your day")

**Closer family**
- On SOS, **connect the parent straight to the child's phone** (call bridge), falling back to the emergency contact
- Child records a real voice message from their phone
- Birthday, anniversary and festival greetings (Sankranti, Diwali, Pongal)
- Grandchildren's messages on special days

**Health helpers**
- Doctor appointment reminders the day before
- Medicine refill reminders ("your Metformin strip should run out on Friday")
- Monthly PDF health summary to share with their doctor
- Partnerships with pharmacies for home delivery

**Product & business**
- Phone OTP login, multiple admins per family
- Subscription billing with Razorpay/Stripe webhooks
- Admin panel for your team (all families, failed calls, alerts today)
- Corporate plan: companies offer it to employees as a benefit
- Senior-living communities and clinics as B2B customers

---

## 14. Launch checklist

- [ ] Every script line reviewed by a native speaker
- [ ] Tested on landline, keypad phone and smartphone
- [ ] Tested on real parents for at least 3 days
- [ ] Webhook validation on, `ADMIN_TOKEN` changed
- [ ] WhatsApp templates approved
- [ ] Payment links working, refund policy written
- [ ] Terms, privacy policy and "not a medical service" notice published
- [ ] Data backup in place
- [ ] Demo video recorded

---

Made with love for families who live far apart. 🌼
