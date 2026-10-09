/**
 * The Atelier — the waiting ritual while a look is being made.
 *
 * The guest's portrait rests in shadow inside the arch; their touch (or the
 * cursor) carries a pool of warm light across it. A brass thread draws a
 * garment around the silhouette, motes of dust drift in the lamp light, and
 * the atelier tells the story of the piece. The guest is asked where they
 * will wear it — the answer shapes the stylist's note.
 */

import { $, $$, wait, reducedMotion } from './motion.js';

const PHASES = ['reading', 'draping', 'pressing', 'unveiling'];

const HOUSE_STORIES = [
  'Every piece in the salon is cut in our own atelier — never more than a handful of each.',
  'A tailor once told us: the cloth always knows the body before we do.',
  'We press each seam three times — once to set it, once to soften it, once to forget it was ever there.',
  'Light is the last thing we add. It is also the most important.',
];

export function createAtelier() {
  const root = $('[data-atelier]');
  const frame = $('[data-atelier-frame]', root);
  const portraits = [$('[data-atelier-portrait]', root), $('[data-atelier-portrait-lit]', root)];
  const garmentEl = $('[data-atelier-garment]', root);
  const phaseEls = $$('[data-atelier-phases] li', root);
  const progressEl = $('[data-atelier-progress]', root);
  const storyEl = $('[data-atelier-story]', root);
  const chips = $$('[data-occasion]', root);
  const errorBox = $('[data-atelier-error]', root);
  const errorText = $('[data-atelier-error-text]', root);
  const canvas = $('[data-atelier-dust]', root);

  let state = null;

  /* ── dust in the lamp light ───────────────────────────────── */
  function dust() {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      w = canvas.width = innerWidth * dpr;
      h = canvas.height = innerHeight * dpr;
    };
    resize();
    addEventListener('resize', resize);
    const motes = Array.from({ length: Math.min(90, Math.round(innerWidth / 14)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: (Math.random() * 1.4 + 0.3) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr, vy: -(Math.random() * 0.25 + 0.05) * dpr,
      a: Math.random() * 0.5 + 0.15, t: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const px = state.pointer.x * dpr, py = state.pointer.y * dpr;
      for (const m of motes) {
        m.t += 0.01;
        const dx = px - m.x, dy = py - m.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < (220 * dpr) ** 2) { m.vx += dx * 0.000006; m.vy += dy * 0.000006; }
        m.vx *= 0.995; m.vy = m.vy * 0.995 - 0.0006 * dpr;
        m.x += m.vx + Math.sin(m.t) * 0.08 * dpr;
        m.y += m.vy;
        if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; m.vy = -(Math.random() * 0.25 + 0.05) * dpr; }
        if (m.x < -10) m.x = w + 10; else if (m.x > w + 10) m.x = -10;
        const glow = d2 < (160 * dpr) ** 2 ? 0.35 : 0;
        ctx.beginPath();
        ctx.fillStyle = `rgba(232, 214, 178, ${Math.min(1, m.a + glow) * (0.6 + Math.sin(m.t * 2) * 0.4)})`;
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    if (!reducedMotion) draw();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); ctx.clearRect(0, 0, w, h); };
  }

  /* ── light that follows the guest ─────────────────────────── */
  function spotlight() {
    let idle = true, idleTimer, raf = 0, t = 0;
    const set = (x, y) => {
      frame.style.setProperty('--mx', `${x}%`);
      frame.style.setProperty('--my', `${y}%`);
    };
    const onMove = (e) => {
      state.pointer = { x: e.clientX, y: e.clientY };
      const r = frame.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      idle = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { idle = true; }, 2600);
    };
    const orbit = () => {
      t += 0.006;
      if (idle) set(50 + Math.sin(t * 1.3) * 26, 42 + Math.sin(t * 0.9) * 30);
      raf = requestAnimationFrame(orbit);
    };
    root.addEventListener('pointermove', onMove);
    if (!reducedMotion) orbit();
    return () => { root.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); clearTimeout(idleTimer); };
  }

  /* ── the story of the piece ───────────────────────────────── */
  function stories(garment) {
    const lines = [...(garment.notes || []), ...HOUSE_STORIES];
    let i = 0;
    storyEl.textContent = lines[0];
    const id = setInterval(async () => {
      storyEl.classList.add('is-changing');
      await wait(900);
      i = (i + 1) % lines.length;
      storyEl.textContent = lines[i];
      storyEl.classList.remove('is-changing');
    }, 6200);
    return () => clearInterval(id);
  }

  /* ── phases & progress ────────────────────────────────────── */
  function paintPhase() {
    const elapsed = (performance.now() - state.startedAt) / 1000;
    const byTime = Math.min(2, Math.floor(elapsed / 3.6));
    const index = Math.max(byTime, PHASES.indexOf(state.serverPhase));
    phaseEls.forEach((li, i) => {
      li.classList.toggle('is-done', i < index);
      li.classList.toggle('is-current', i === index);
    });
    const eased = 1 - Math.exp(-elapsed / 8);
    const floor = index / PHASES.length;
    progressEl.style.transform = `scaleX(${Math.min(0.94, Math.max(floor, eased * 0.94))})`;
  }

  function onChip(e) {
    const chip = e.target.closest('[data-occasion]');
    if (!chip) return;
    chips.forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
    state.onOccasion?.(chip.dataset.occasion);
  }

  return {
    open({ portraitUrl, garment, occasion, onOccasion }) {
      this.close(true);
      state = {
        startedAt: performance.now(),
        serverPhase: 'reading',
        pointer: { x: innerWidth / 2, y: innerHeight / 2 },
        onOccasion,
        cleanups: [],
      };
      portraits.forEach((img) => { img.src = portraitUrl || ''; });
      garmentEl.textContent = garment.name;
      chips.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.occasion === occasion)));
      root.classList.remove('is-done', 'is-error');
      errorBox.hidden = true;
      progressEl.style.transform = 'scaleX(0)';

      root.hidden = false;
      document.body.classList.add('is-locked');
      requestAnimationFrame(() => root.classList.add('is-open'));

      root.addEventListener('click', onChip);
      const tick = setInterval(paintPhase, 400);
      paintPhase();
      state.cleanups.push(dust(), spotlight(), stories(garment), () => clearInterval(tick), () => root.removeEventListener('click', onChip));
    },

    phase(name) {
      if (state && PHASES.includes(name)) state.serverPhase = name;
    },

    /** The unveiling: flash of light, then hand over to the reveal. */
    async complete() {
      if (!state) return;
      state.serverPhase = 'unveiling';
      paintPhase();
      progressEl.style.transform = 'scaleX(1)';
      await wait(500);
      root.classList.add('is-done');
      await wait(reducedMotion ? 50 : 1100);
    },

    fail(message, { onRetry, onDismiss }) {
      if (!state) return;
      root.classList.add('is-error');
      errorText.textContent = message;
      errorBox.hidden = false;
      const handler = (e) => {
        if (e.target.closest('[data-atelier-retry]')) { root.removeEventListener('click', handler); onRetry(); }
        if (e.target.closest('[data-atelier-dismiss]')) { root.removeEventListener('click', handler); onDismiss(); }
      };
      root.addEventListener('click', handler);
    },

    async close(immediate = false) {
      if (!state) return;
      state.cleanups.forEach((fn) => fn());
      state = null;
      root.classList.remove('is-open');
      if (!immediate) await wait(reducedMotion ? 0 : 900);
      if (!state) {
        root.hidden = true;
        document.body.classList.remove('is-locked');
      }
    },
  };
}
