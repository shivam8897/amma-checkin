// Motion and sound for Amma Check-in. Browser APIs only: no libraries, no audio files.
//
// Sounds are synthesised with Web Audio (real telephone DTMF tones, ringback, chimes).
// They only play after the person has clicked or pressed something, and there's a
// remembered mute switch. All motion is skipped when prefers-reduced-motion is set.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ── Sound ───────────────────────────────────────────────
  let ctx = null;
  let unlocked = false; // no sound until the person interacts with the page
  let muted = store.get('amma-sfx') === 'off';
  const unlock = () => { unlocked = true; };
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });

  function audio() {
    if (muted || !unlocked) return null;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }

  /** One soft note (or chord). Envelope avoids clicks. */
  function tone(freqs, { dur = 0.15, type = 'sine', vol = 0.1, at = 0, attack = 0.008, release = 0.08, slideTo } = {}) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + at;
    const g = c.createGain();
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.setValueAtTime(vol, t0 + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    for (const f of [].concat(freqs)) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + release + 0.02);
    }
  }

  // The real dual tones a phone keypad makes.
  const DTMF = {
    1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
    4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
    '*': [941, 1209], 0: [941, 1336], '#': [941, 1477],
  };

  const sfx = {
    key: (k) => tone(DTMF[k] || DTMF[0], { dur: 0.11, vol: 0.05 }),
    /** Indian-style ringback: two short 400 Hz bursts. Returns its length in ms. */
    ring: () => { tone([400, 450], { dur: 0.38, vol: 0.04 }); tone([400, 450], { dur: 0.38, vol: 0.04, at: 0.58 }); return 1500; },
    pickup: () => tone(660, { dur: 0.07, vol: 0.05, type: 'triangle', slideTo: 990 }),
    hangup: () => [0, 0.2, 0.4].forEach((at) => tone(480, { dur: 0.11, vol: 0.045, at })),
    tap: () => tone(1400, { dur: 0.018, vol: 0.025, type: 'triangle', release: 0.03 }),
    recStart: () => { tone(523.25, { dur: 0.07, vol: 0.07, type: 'triangle' }); tone(783.99, { dur: 0.09, vol: 0.07, type: 'triangle', at: 0.08 }); },
    recStop: () => { tone(783.99, { dur: 0.07, vol: 0.07, type: 'triangle' }); tone(523.25, { dur: 0.09, vol: 0.07, type: 'triangle', at: 0.08 }); },
    saved: () => tone(1046.5, { dur: 0.06, vol: 0.05, type: 'triangle', release: 0.25 }),
    success: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { dur: 0.12, vol: 0.055, type: 'triangle', at: i * 0.085, release: 0.45 })),
    alert: () => { tone(880, { dur: 0.1, vol: 0.05, type: 'triangle' }); tone(659.25, { dur: 0.16, vol: 0.05, type: 'triangle', at: 0.13 }); },
    ding: () => tone([1318.5, 1975.5], { dur: 0.05, vol: 0.035, type: 'sine', release: 0.5 }),
  };

  function setMuted(on) {
    muted = on;
    store.set('amma-sfx', on ? 'off' : 'on');
    document.querySelectorAll('[data-fx-mute]').forEach(paint);
    if (!on) { unlocked = true; sfx.tap(); }
  }
  const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
  function paint(btn) {
    btn.innerHTML = muted ? ICON_OFF : ICON_ON;
    btn.setAttribute('aria-pressed', String(!muted));
    btn.title = muted ? 'Sounds off' : 'Sounds on';
    btn.setAttribute('aria-label', muted ? 'Turn sounds on' : 'Turn sounds off');
  }
  /** A small speaker button that toggles sound effects. */
  function muteButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fx-mute';
    b.dataset.fxMute = '';
    paint(b);
    b.addEventListener('click', () => setMuted(!muted));
    return b;
  }

  // ── Motion ──────────────────────────────────────────────
  /** Count a number up from zero (keeps any suffix like "%"). */
  function countUp(el, ms = 900) {
    const m = /^(\d+)(.*)$/.exec(el.textContent.trim());
    if (reduce || !m) return;
    const end = Number(m[1]), suffix = m[2], t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Fade elements up as they scroll into view. Stagger with style="--d: 120ms". */
  function reveal(root = document) {
    const els = root.querySelectorAll('[data-reveal]:not(.in)');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((e) => io.observe(e));
  }

  /** A soft light that follows the cursor across cards. */
  function spotlight(selector) {
    if (reduce || !matchMedia('(pointer: fine)').matches) return;
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest?.(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /** Gentle 3D tilt toward the cursor. */
  function tilt(el, max = 6) {
    if (reduce || !el || !matchMedia('(pointer: fine)').matches) return;
    el.style.transition = 'transform .25s ease-out';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${x * max}deg) rotateX(${-y * max}deg) translateZ(0)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  /** Ink ripple from where a button was pressed. */
  function ripples(selector) {
    if (reduce) return;
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest?.(selector);
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'fx-ripple';
      dot.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      b.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    });
  }

  /** A burst of confetti in brand colours, from a point (defaults to screen centre). */
  function confetti(x = innerWidth / 2, y = innerHeight / 3, count = 90) {
    if (reduce) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-confetti';
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    document.body.appendChild(canvas);
    const g = canvas.getContext('2d');
    g.scale(devicePixelRatio, devicePixelRatio);
    const colors = ['#ea580c', '#fb923c', '#fdba74', '#f59e0b', '#16a34a', '#fde68a'];
    const parts = Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 8;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, round: Math.random() < 0.35 };
    });
    const t0 = performance.now();
    const frame = (t) => {
      const life = (t - t0) / 1600;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.globalAlpha = Math.max(0, 1 - life * life);
        g.fillStyle = p.c;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        if (p.round) { g.beginPath(); g.arc(0, 0, p.r * 0.7, 0, 7); g.fill(); } else g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        g.restore();
      }
      if (life < 1) requestAnimationFrame(frame); else canvas.remove();
    };
    requestAnimationFrame(frame);
  }

  /** Confetti from the middle of an element. */
  const confettiAt = (el, n) => { const r = el.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, n); };

  document.documentElement.classList.add('fx');
  window.FX = { reduce, sfx, isMuted: () => muted, setMuted, muteButton, countUp, reveal, spotlight, tilt, ripples, confetti, confettiAt };
})();
