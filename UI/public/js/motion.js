/**
 * Motion primitives: the curtain between chapters, the cursor,
 * staggered reveals and the whisper (a discreet toast).
 */

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const EASE_LUX = 'cubic-bezier(.77,0,.18,1)';

/** Give each [data-reveal] in a root an incremental --i for staggering. */
export function stagger(root) {
  $$('[data-reveal]', root).forEach((el, i) => {
    if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i);
  });
}

/** Replay reveal animations inside an element. */
export function replay(root) {
  $$('[data-reveal]', root).forEach((el) => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });
}

/** Draw the curtain across the stage, run `swap`, then lift it. */
export async function curtain(swap, { tone = 'dark' } = {}) {
  const el = $('[data-curtain]');
  if (reducedMotion) {
    await swap();
    return;
  }
  el.classList.toggle('is-bone', tone === 'bone');
  const mark = el.firstElementChild;
  el.style.visibility = 'visible';
  await el.animate([{ transform: 'translateY(101%)' }, { transform: 'translateY(0%)' }], {
    duration: 760, easing: EASE_LUX, fill: 'forwards',
  }).finished;
  mark.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }, { opacity: 0 }], {
    duration: 700, easing: 'ease-out',
  });
  await swap();
  await wait(380);
  await el.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(-101%)' }], {
    duration: 820, easing: EASE_LUX, fill: 'forwards',
  }).finished;
  el.getAnimations().forEach((a) => a.cancel());
  el.style.visibility = '';
}

/** Split text into animated letter spans (for the wordmark). */
export function splitLetters(el) {
  const text = el.textContent;
  el.textContent = '';
  [...text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'ch' + (ch === 'È' ? ' ch--accent' : '');
    span.style.setProperty('--c', i);
    span.textContent = ch;
    span.setAttribute('aria-hidden', 'true');
    el.append(span);
  });
}

/** Split a greeting into word spans; the guest's name is set in italic. */
export function splitWords(el, text, name) {
  el.textContent = '';
  const first = (name || '').split(/\s+/)[0];
  text.split(/\s+/).forEach((word, i) => {
    const span = document.createElement('span');
    const bare = word.replace(/[.,!]/g, '');
    span.className = 'word' + (first && bare === first ? ' word--name' : '');
    span.style.setProperty('--w', i);
    span.textContent = word;
    el.append(span, ' ');
  });
  el.setAttribute('aria-label', text);
}

let whisperTimer;
export function whisper(message, ms = 3600) {
  const el = $('[data-whisper]');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(whisperTimer);
  whisperTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/** A soft trailing cursor for fine pointers. */
export function initCursor() {
  if (!matchMedia('(pointer: fine)').matches || reducedMotion) return;
  const cursor = $('.cursor');
  document.documentElement.classList.add('has-cursor');
  let x = -100, y = -100, rx = -100, ry = -100;
  addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
    const hover = e.target.closest('button, a, label, input, [role="slider"], .garment');
    cursor.classList.toggle('is-hover', Boolean(hover));
  }, { passive: true });
  addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  const tick = () => {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    cursor.style.setProperty('--x', `${x}px`);
    cursor.style.setProperty('--y', `${y}px`);
    cursor.style.setProperty('--rx', `${rx}px`);
    cursor.style.setProperty('--ry', `${ry}px`);
    requestAnimationFrame(tick);
  };
  tick();
}

export function formatMoney(amount, { currency, locale }) {
  if (amount == null) return 'Price on request';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
