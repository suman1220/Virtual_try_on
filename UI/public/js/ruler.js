/**
 * The height ribbon — a horizontally scrolling tape measure.
 * Swipe on touch, drag or wheel on desktop, arrow keys anywhere.
 */

const MIN = 140;
const MAX = 210;

export function createRuler({ root, track, onChange, initial = 165 }) {
  for (let cm = MIN; cm <= MAX; cm++) {
    const tick = document.createElement('span');
    tick.className = 'tick' + (cm % 10 === 0 ? ' tick--10' : cm % 5 === 0 ? ' tick--5' : '');
    tick.dataset.cm = cm;
    if (cm % 10 === 0) {
      const label = document.createElement('span');
      label.className = 'tick__label';
      label.textContent = cm;
      tick.append(label);
    }
    track.append(tick);
  }

  const ticks = [...track.children];
  const step = () => ticks[1].offsetLeft - ticks[0].offsetLeft;
  // scrollLeft at which the first tick sits under the centre needle
  const origin = () => ticks[0].offsetLeft + ticks[0].offsetWidth / 2 - root.clientWidth / 2;
  let value = initial;
  let near = [];

  const read = () => {
    const v = Math.round((root.scrollLeft - origin()) / step()) + MIN;
    return Math.max(MIN, Math.min(MAX, v));
  };

  const paint = () => {
    near.forEach((t) => t.classList.remove('is-near'));
    near = ticks.slice(Math.max(0, value - MIN - 1), value - MIN + 2);
    near.forEach((t) => t.classList.add('is-near'));
    root.setAttribute('aria-valuenow', value);
    root.setAttribute('aria-valuetext', `${value} centimetres`);
  };

  const scrollTo = (v, smooth = true) => {
    root.scrollTo({ left: origin() + (v - MIN) * step(), behavior: smooth ? 'smooth' : 'auto' });
  };

  let raf = 0;
  root.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const v = read();
      if (v !== value) {
        value = v;
        paint();
        onChange(value);
      }
    });
  }, { passive: true });

  // Mouse drag (touch scrolls natively)
  let dragX = null;
  let startLeft = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragX = e.clientX;
    startLeft = root.scrollLeft;
    root.classList.add('is-dragging');
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    root.scrollLeft = startLeft - (e.clientX - dragX);
  });
  const endDrag = () => {
    if (dragX === null) return;
    dragX = null;
    root.classList.remove('is-dragging');
    scrollTo(read());
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  // Vertical wheel scrolls the ribbon horizontally
  root.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      root.scrollLeft += e.deltaY * 0.6;
    }
  }, { passive: false });

  root.addEventListener('keydown', (e) => {
    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (!delta) return;
    e.preventDefault();
    scrollTo(Math.max(MIN, Math.min(MAX, value + delta)));
  });

  // Clicking a tick jumps to it
  track.addEventListener('click', (e) => {
    const tick = e.target.closest('.tick');
    if (tick) scrollTo(Number(tick.dataset.cm));
  });

  return {
    get value() { return value; },
    show(v = value) {
      value = v;
      requestAnimationFrame(() => { scrollTo(v, false); paint(); onChange(value); });
    },
  };
}

export function toImperial(cm) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - ft * 12);
  if (inches === 12) { ft += 1; inches = 0; }
  return `${ft}′ ${inches}″`;
}
