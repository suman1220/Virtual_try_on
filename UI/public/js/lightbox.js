/**
 * Full-fidelity viewer: the look at native resolution, with click / double-tap
 * to zoom at a point, wheel and pinch zoom, and drag to pan.
 */

import { $ } from './motion.js';

const MAX_ZOOM = 4;

export function createLightbox() {
  const root = $('[data-lightbox]');
  const canvas = $('[data-lightbox-canvas]', root);
  const img = $('[data-lightbox-img]', root);

  let z = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let pinch = null;
  let pan = null;
  let moved = false;
  let lastTap = 0;

  const apply = () => {
    img.style.setProperty('--z', z);
    img.style.setProperty('--tx', `${tx}px`);
    img.style.setProperty('--ty', `${ty}px`);
    canvas.classList.toggle('is-zoomed', z > 1.01);
  };

  const clamp = () => {
    const w = img.offsetWidth * z, h = img.offsetHeight * z;
    const maxX = Math.max(0, (w - innerWidth) / 2);
    const maxY = Math.max(0, (h - innerHeight) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  };

  /** Zoom to `next`, keeping the screen point (cx, cy) fixed. */
  const zoomAt = (next, cx, cy) => {
    next = Math.max(1, Math.min(MAX_ZOOM, next));
    const dx = cx - innerWidth / 2, dy = cy - innerHeight / 2;
    tx = dx - ((dx - tx) * next) / z;
    ty = dy - ((dy - ty) * next) / z;
    z = next;
    if (z === 1) { tx = 0; ty = 0; }
    clamp();
    apply();
  };

  const toggleAt = (x, y) => zoomAt(z > 1.01 ? 1 : 2.4, x, y);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      pan = null;
    } else {
      pan = { x: e.clientX, y: e.clientY, tx, ty };
    }
    canvas.classList.add('is-panning');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.z * (d / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true;
    } else if (pan) {
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (z > 1.01) {
        tx = pan.tx + dx;
        ty = pan.ty + dy;
        clamp();
        apply();
      }
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) {
      canvas.classList.remove('is-panning');
      if (!moved && e.type === 'pointerup') {
        if (e.pointerType === 'mouse') toggleAt(e.clientX, e.clientY);
        else {
          const now = Date.now();
          if (now - lastTap < 320) toggleAt(e.clientX, e.clientY);
          lastTap = now;
        }
      }
      pan = null;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const close = () => {
    root.hidden = true;
    document.body.classList.remove('is-locked');
  };
  $('[data-close-lightbox]', root).addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) close(); });

  return {
    open(src) {
      if (!src) return;
      img.src = src;
      z = 1; tx = 0; ty = 0;
      apply();
      root.hidden = false;
      document.body.classList.add('is-locked');
    },
    close,
  };
}
