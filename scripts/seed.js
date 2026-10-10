// Creates a demo family with two weeks of realistic history.
// Usage: npm run seed  → then open http://localhost:3000/dashboard.html?key=demo
const db = require('../src/db');
const alerts = require('../src/services/alerts');
const { today } = require('../src/engine/callFlow');

const KEY = 'demo';
const TZ = 'Asia/Kolkata';

async function main() {
  // Remove a previous demo family.
  const old = db.families.find((f) => f.accessKey === KEY);
  if (old) {
    for (const coll of [db.parents, db.checkins, db.alerts, db.voices]) coll.filter((r) => r.familyId === old.id).forEach((r) => coll.remove(r.id));
    db.families.remove(old.id);
  }

  const family = db.families.insert({
    id: db.id('fam'), accessKey: KEY, childName: 'Ravi', email: 'ravi@example.com',
    plan: 'couple', currency: 'usd', status: 'active', timezone: TZ,
    contacts: [
      { name: 'Ravi', phone: '+14155550101', relation: 'Son', role: 'family' },
      { name: 'Priya', phone: '+919900000002', relation: 'Daughter', role: 'family' },
      { name: 'Suresh uncle', phone: '+919900000003', relation: 'Neighbour', role: 'emergency' },
    ],
    createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  });

  const amma = db.parents.insert({
    id: db.id('par'), familyId: family.id, name: 'Lakshmi', addressAs: 'Lakshmi garu', relation: 'Amma',
    phone: '+919900000010', language: 'te', timezone: TZ,
    schedule: [{ slot: 'morning', time: '08:30' }, { slot: 'evening', time: '20:00' }],
    medicines: [
      { id: 'med_metformin', name: 'Metformin', slot: 'morning' },
      { id: 'med_bp', name: 'BP tablet', slot: 'morning' },
      { id: 'med_statin', name: 'Atorvastatin', slot: 'evening' },
    ],
    askMood: true, askMeal: true, askReading: 'sugar', consentGiven: true, active: true, voiceId: null,
    voiceNoteText: 'అమ్మా, ఈ ఆదివారం వీడియో కాల్ చేస్తాను. జాగ్రత్త!',
    voiceNoteUrl: null, voiceNotePlayedAt: null, pausedUntil: null,
    createdAt: family.createdAt,
  });

  const nanna = db.parents.insert({
    id: db.id('par'), familyId: family.id, name: 'Venkat Rao', addressAs: 'Venkat Rao garu', relation: 'Nanna',
    phone: '+919900000011', language: 'te', timezone: TZ,
    schedule: [{ slot: 'morning', time: '08:45' }],
    medicines: [{ id: 'med_thyroid', name: 'Thyroid tablet', slot: 'morning' }],
    askMood: true, askMeal: true, askReading: 'none', consentGiven: true, active: true, voiceId: null,
    voiceNoteText: null, voiceNoteUrl: null, pausedUntil: null,
    createdAt: family.createdAt,
  });

  // Patterns for the last 13 days (today is left open for the live demo).
  const ammaDays = ['ok', 'ok', 'missed', 'ok', 'ok', 'ok', 'unwell', 'ok', 'ok', 'noanswer', 'ok', 'ok', 'ok'];
  const nannaDays = ['ok', 'ok', 'ok', 'okay', 'ok', 'nomeal', 'ok', 'ok', 'okay', 'ok', 'ok', 'ok', 'ok'];
  const sugar = [138, 145, 162, 131, 128, 150, 268, 140, 133, null, 129, 126, 135];

  async function addDay(parent, daysAgo, kind, reading) {
    const at = new Date(Date.now() - daysAgo * 86_400_000);
    const date = today(TZ, at);
    for (const slot of parent.schedule.map((s) => s.slot)) {
      const meds = parent.medicines.filter((m) => m.slot === slot);
      const answers = { meds: {}, meal: null, mood: null, reading: null, sos: false, voiceNotePlayed: false };
      let status = 'completed';
      if (kind === 'noanswer' && slot === 'morning') status = 'no_answer';
      for (const m of meds) answers.meds[m.id] = status === 'no_answer' ? 'no_response' : (kind === 'missed' && m.slot === 'morning' && m.id === meds[0].id ? 'missed' : 'taken');
      if (status !== 'no_answer') answers.meal = kind === 'nomeal' && slot === 'morning' ? 'skipped' : 'ate';
      if (slot === 'morning' && status !== 'no_answer') {
        answers.mood = kind === 'unwell' ? 'unwell' : kind === 'okay' ? 'okay' : 'good';
        if (parent.askReading === 'sugar') answers.reading = reading;
      }
      const hour = slot === 'morning' ? 3 : 14; // UTC hours ≈ 08:30 / 20:00 IST
      const time = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(5 + daysAgo).padStart(2, '0')}:00Z`).toISOString();
      const checkin = db.checkins.insert({
        id: db.id('chk'), parentId: parent.id, familyId: family.id, date, slot, status,
        attempts: status === 'no_answer' ? 2 : 1,
        steps: [...meds.map((m) => ({ type: 'med', medId: m.id, med: m.name })), { type: 'meal', slot }, ...(slot === 'morning' ? [{ type: 'mood' }] : [])],
        answers, answeredAt: status === 'no_answer' ? null : time, completedAt: time, createdAt: time,
      });
      if (daysAgo <= 10) {
        // Recreate the alerts these days would have produced (timestamps backdated).
        const raise = async (type, data) => { const a = await alerts.raise(checkin, type, data); db.alerts.update(a.id, { createdAt: time, acknowledged: daysAgo > 1 }); };
        if (status === 'no_answer') await raise('NO_ANSWER', { attempts: 2 });
        if (answers.mood === 'unwell') await raise('UNWELL');
        if (answers.meal === 'skipped') await raise('MEAL_SKIPPED', { meal: slot === 'evening' ? 'dinner' : 'breakfast' });
        for (const m of meds) if (answers.meds[m.id] === 'missed') await raise('MED_MISSED', { med: m.name });
        if (answers.reading && answers.reading > 250) await raise('READING_OUT_OF_RANGE', { value: answers.reading });
      }
    }
  }

  process.env.NODE_ENV = 'test'; // keep the console quiet while seeding
  for (let i = 13; i >= 1; i--) {
    await addDay(amma, i, ammaDays[13 - i], sugar[13 - i]);
    await addDay(nanna, i, nannaDays[13 - i], null);
  }
  db.flush();
  console.log('✅ Demo family created.');
  console.log('   Start the server (npm start) and open: http://localhost:3000/dashboard.html?key=demo');
}

main();
