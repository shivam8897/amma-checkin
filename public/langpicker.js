// Language picker: cards with each language in its own script, a live sample of how
// the call begins, and "Hear it" (the browser's voice, when it has one for that language).
// Used by the sign-up form and the dashboard settings. A plain radio group underneath,
// so forms read it like any other field.
(() => {
  const LANGS = [
    ['te', 'తెలుగు', 'Telugu'],
    ['hi', 'हिन्दी', 'Hindi'],
    ['ta', 'தமிழ்', 'Tamil'],
    ['mr', 'मराठी', 'Marathi'],
    ['ml', 'മലയാളം', 'Malayalam'],
    ['bn', 'বাংলা', 'Bangla'],
    ['en', 'English', 'English'],
  ];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let samples = {};

  const css = `
.lp { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.lp-opt { position: relative; display: grid; gap: 1px; padding: 10px 12px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sheet); cursor: pointer; transition: border-color .2s, background .2s, transform .15s, box-shadow .2s; }
.lp-opt:hover { border-color: var(--haldi); transform: translateY(-1px); }
.lp-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.lp-native { font-size: 1.12rem; font-weight: 600; line-height: 1.3; color: var(--ink); }
.lp-en { font-size: .78rem; color: var(--ink-soft); }
.lp-opt:has(input:checked) { border-color: var(--haldi); background: var(--haldi-wash, #fff0e4); box-shadow: 0 6px 16px -10px rgba(234,88,12,.7); }
.lp-opt:has(input:checked)::after { content: '✓'; position: absolute; top: 8px; right: 10px; width: 18px; height: 18px; border-radius: 50%; background: var(--haldi); color: #fff; font-size: .7rem; font-weight: 700; display: grid; place-items: center; animation: lp-pop .3s cubic-bezier(.3,1.5,.5,1); }
.lp-opt:has(input:focus-visible) { outline: 3px solid var(--haldi); outline-offset: 2px; }
@keyframes lp-pop { from { transform: scale(0); } }
.lp-sample { margin-top: 10px; display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: var(--paper); border: 1px dashed var(--line); }
.lp-sample[hidden] { display: none; }
.lp-sample p { flex: 1; margin: 0; font-size: .98rem; line-height: 1.55; color: var(--ink); }
.lp-sample small { display: block; font-size: .74rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--haldi-deep, #c2410c); margin-bottom: 2px; }
.lp-hear { flex: none; border: 0; border-radius: 999px; padding: 7px 12px; font: 600 .82rem/1 inherit; font-family: inherit; background: var(--haldi-wash, #fff0e4); color: var(--haldi-deep, #c2410c); cursor: pointer; }
.lp-hear:hover { filter: brightness(.97); }
.lp-note { font-size: .8rem; color: var(--ink-soft); margin-top: 6px; }
.lp-sample p.swap { animation: lp-fade .35s ease; }
@keyframes lp-fade { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .lp-opt, .lp-opt::after, .lp-sample p.swap { transition: none; animation: none !important; } }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /** Markup for a picker. `name` is the form field name. */
  function html({ name = 'language', value = 'te', id = 'lp' } = {}) {
    const opts = LANGS.map(([code, native, english]) => `
      <label class="lp-opt"><input type="radio" name="${esc(name)}" value="${code}" ${code === value ? 'checked' : ''}>
        <span class="lp-native" lang="${code}">${esc(native)}</span><span class="lp-en">${code === 'en' ? 'India' : esc(english)}</span></label>`).join('');
    return `<div class="lp" role="radiogroup" aria-label="Language of the call" data-lp="${esc(id)}">${opts}</div>
      <div class="lp-sample" data-lp-sample="${esc(id)}" aria-live="polite" ${samples[value] ? '' : 'hidden'}>
        <p lang="${value}"><small>How the call begins</small><span>${esc(samples[value] || '')}</span></p>
        <button type="button" class="lp-hear" data-lp-hear="${esc(id)}">▶ Hear it</button>
      </div>
      <p class="lp-note" data-lp-note="${esc(id)}" hidden></p>`;
  }

  function current(id) {
    return document.querySelector(`[data-lp="${id}"] input:checked`)?.value;
  }

  function showSample(id) {
    const lang = current(id), box = document.querySelector(`[data-lp-sample="${id}"]`);
    if (!box) return;
    const p = box.querySelector('p');
    box.hidden = !samples[lang];
    p.lang = lang;
    p.querySelector('span').textContent = samples[lang] || '';
    p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap');
    const note = document.querySelector(`[data-lp-note="${id}"]`);
    if (note) note.hidden = true;
  }

  function hasVoice(lang) {
    if (!('speechSynthesis' in window)) return false;
    const voices = speechSynthesis.getVoices();
    return !voices.length || voices.some((v) => v.lang.toLowerCase().startsWith(lang));
  }

  function hear(id) {
    const lang = current(id), text = samples[lang];
    const note = document.querySelector(`[data-lp-note="${id}"]`);
    if (!text) return;
    if (!hasVoice(lang)) {
      const name = LANGS.find((l) => l[0] === lang)[2];
      if (note) { note.hidden = false; note.textContent = `This browser has no ${name} voice to preview with. The real call uses a natural ${name} phone voice.`; }
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = `${lang}-IN`;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  document.addEventListener('change', (e) => {
    const group = e.target.closest?.('[data-lp]');
    if (!group) return;
    window.FX?.sfx.tap();
    showSample(group.dataset.lp);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-lp-hear]');
    if (b) hear(b.dataset.lpHear);
  });
  // Some browsers load their voice list late.
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  window.LangPicker = {
    html,
    LANGS,
    /** Give the picker the server's sample greetings, then refresh any open pickers. */
    setSamples(s) {
      samples = s || {};
      document.querySelectorAll('[data-lp]').forEach((g) => showSample(g.dataset.lp));
    },
  };
})();
