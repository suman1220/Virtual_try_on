/**
 * Guided full-length capture: silhouette outline, self-timer so the guest
 * can step back, front/rear switching. Resolves with a JPEG Blob, or null.
 */

import { $, wait } from './motion.js';

const TIMERS = [5, 10, 0];

export function openCamera() {
  const root = $('[data-camera]');
  const video = $('[data-camera-video]', root);
  const count = $('[data-camera-count]', root);
  const flash = $('[data-camera-flash]', root);
  const error = $('[data-camera-error]', root);
  const shutter = $('[data-camera-shutter]', root);
  const timerBtn = $('[data-camera-timer]', root);
  const timerLabel = $('[data-camera-timer-label]', root);

  let stream = null;
  let facing = 'user';
  let timerIndex = 0;
  let busy = false;

  return new Promise((resolve) => {
    const stop = () => stream?.getTracks().forEach((t) => t.stop());

    const close = (result) => {
      stop();
      root.hidden = true;
      document.body.classList.remove('is-locked');
      root.removeEventListener('click', onClick);
      removeEventListener('keydown', onKey);
      resolve(result);
    };

    const start = async () => {
      stop();
      error.hidden = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 2560 } },
        });
        video.srcObject = stream;
        video.classList.toggle('is-mirrored', facing === 'user');
        await video.play().catch(() => {});
      } catch {
        error.textContent = 'We could not open your camera. Kindly allow access, or share a photograph instead.';
        error.hidden = false;
      }
    };

    const capture = async () => {
      if (busy || !stream) return;
      busy = true;
      shutter.classList.add('is-armed');
      for (let s = TIMERS[timerIndex]; s > 0; s--) {
        count.textContent = s;
        count.classList.remove('is-tick');
        void count.offsetWidth;
        count.classList.add('is-tick');
        await wait(1000);
      }
      count.textContent = '';
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.93));
      shutter.classList.remove('is-armed');
      busy = false;
      await wait(350);
      close(blob);
    };

    const onClick = (e) => {
      if (e.target.closest('[data-camera-close]')) close(null);
      else if (e.target.closest('[data-camera-shutter]')) capture();
      else if (e.target.closest('[data-camera-flip]') && !busy) {
        facing = facing === 'user' ? 'environment' : 'user';
        start();
      } else if (e.target.closest('[data-camera-timer]') && !busy) {
        timerIndex = (timerIndex + 1) % TIMERS.length;
        timerLabel.textContent = TIMERS[timerIndex] ? `${TIMERS[timerIndex]}s` : 'Off';
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); capture(); }
    };

    timerLabel.textContent = `${TIMERS[timerIndex]}s`;
    timerBtn.setAttribute('aria-label', 'Self-timer');
    root.hidden = false;
    document.body.classList.add('is-locked');
    root.addEventListener('click', onClick);
    addEventListener('keydown', onKey);
    start();
  });
}

/**
 * Normalise any chosen image: respect EXIF orientation, cap the long edge
 * and re-encode as high-quality JPEG. Falls back to the original file when
 * the browser cannot decode it (e.g. HEIC outside Safari).
 */
export async function prepareImage(file, maxEdge = 2400) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    return blob || file;
  } catch {
    return file;
  }
}
