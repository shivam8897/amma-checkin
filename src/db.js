// Tiny JSON-file database. Perfect for the first ~100 families.
// Swap for Postgres/Supabase later: every read/write goes through this module.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const EMPTY = { families: [], parents: [], checkins: [], alerts: [], retries: [], voices: [] };
let state = null;
let file = config.dataFile;

function load() {
  if (state) return state;
  try {
    state = { ...EMPTY, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    state = structuredClone(EMPTY);
  }
  return state;
}

let saveTimer = null;
function save() {
  // Debounced atomic write: write to temp file, then rename.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 50);
}
function flush() {
  if (!state) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

const id = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const token = () => crypto.randomBytes(16).toString('hex');

function collection(name) {
  return {
    all: () => load()[name],
    find: (fn) => load()[name].find(fn),
    filter: (fn) => load()[name].filter(fn),
    get: (key) => load()[name].find((r) => r.id === key),
    insert(row) {
      load()[name].push(row);
      save();
      return row;
    },
    update(key, patch) {
      const row = load()[name].find((r) => r.id === key);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      save();
      return row;
    },
    remove(key) {
      const list = load()[name];
      const i = list.findIndex((r) => r.id === key);
      if (i >= 0) list.splice(i, 1);
      save();
    },
  };
}

module.exports = {
  families: collection('families'),
  parents: collection('parents'),
  checkins: collection('checkins'),
  alerts: collection('alerts'),
  retries: collection('retries'),
  voices: collection('voices'),
  id,
  token,
  flush,
  // Used by tests to point at a throwaway file.
  _reset(newFile) {
    file = newFile || config.dataFile;
    state = structuredClone(EMPTY);
  },
};
