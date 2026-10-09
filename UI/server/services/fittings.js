'use strict';

/**
 * Fittings — orchestrates one try-on from request to stored result.
 *
 * A fitting runs in the background; the browser polls its status.
 * Results are downloaded immediately (genlook URLs are temporary) and
 * written into the guest's private folder as tryon-NN-<garment>.<ext>.
 */

const crypto = require('crypto');
const store = require('./guest-store');
const catalog = require('./catalog');
const genlook = require('./genlook');
const stylist = require('./stylist');
const { detectImage } = require('../lib/image');

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
const PREVIEW_DURATION_MS = [9000, 13000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 10 * 60 * 1000).unref();

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    garmentId: job.garmentId,
    error: job.error || null,
    tryon: job.tryon || null,
  };
}

function start(guest, garment, { occasion } = {}) {
  const job = {
    id: crypto.randomBytes(9).toString('hex'),
    guestId: guest.id,
    garmentId: garment.id,
    occasion: occasion || null,
    status: 'processing',
    phase: 'reading',
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);

  run(job, guest, garment).catch((err) => {
    console.error(`[fitting ${job.id}]`, err.code || '', err.message);
    job.status = 'failed';
    job.error = friendlyError(err);
  });

  return job;
}

function get(guest, jobId) {
  const job = jobs.get(jobId);
  return job && job.guestId === guest.id ? job : null;
}

/** The guest may tell us how they will wear the piece while they wait. */
async function setOccasion(guest, job, occasion) {
  job.occasion = occasion;
  if (job.tryon) {
    const garment = await catalog.get(job.garmentId);
    const record = guest.tryons.find((t) => t.id === job.tryon.id);
    if (garment && record) {
      record.occasion = occasion;
      record.note = stylist.stylistNote({ garment, occasion });
      job.tryon = { ...job.tryon, occasion, note: record.note };
      await store.save(guest);
    }
  }
}

async function ensurePersonImage(guest) {
  const SIX_DAYS = 6 * 24 * 3600 * 1000;
  if (guest.genlook?.imageId && Date.now() - Date.parse(guest.genlook.uploadedAt) < SIX_DAYS) {
    return guest.genlook.imageId;
  }
  const buffer = await store.readFile(guest, guest.photo.file);
  const imageId = await genlook.uploadPerson({ buffer, mime: guest.photo.mime, externalUserId: guest.id });
  guest.genlook = { imageId, uploadedAt: new Date().toISOString() };
  await store.save(guest);
  return imageId;
}

async function run(job, guest, garment) {
  if (!guest.photo) throw Object.assign(new Error('No portrait on file'), { code: 'NO_PORTRAIT' });

  let resultBuffer;
  let simulated = false;

  if (genlook.live) {
    const productImage = await catalog.readImage(garment);
    if (!productImage) {
      throw Object.assign(new Error(`No catalog image for ${garment.id}`), { code: 'GARMENT_IMAGE_MISSING' });
    }
    const personImageId = await ensurePersonImage(guest);
    job.phase = 'draping';
    const generationId = await genlook.createTryOn({
      personImageId,
      product: garment,
      productImage,
      externalUserId: guest.id,
    });
    const result = await genlook.waitFor(generationId, (status) => {
      if (status === 'PROCESSING') job.phase = 'pressing';
    });
    job.phase = 'unveiling';
    resultBuffer = await genlook.download(result.resultImageUrl);
  } else {
    // Atelier preview: rehearse the journey without spending credits.
    simulated = true;
    const [min, max] = PREVIEW_DURATION_MS;
    const total = min + Math.random() * (max - min);
    await sleep(total * 0.3);
    job.phase = 'draping';
    await sleep(total * 0.4);
    job.phase = 'pressing';
    await sleep(total * 0.3);
    job.phase = 'unveiling';
    resultBuffer = await store.readFile(guest, guest.photo.file);
  }

  const kind = detectImage(resultBuffer) || { mime: 'image/jpeg', ext: 'jpg' };
  guest.fittingCount = (guest.fittingCount || guest.tryons.length) + 1;
  const n = guest.fittingCount;
  const file = `tryon-${String(n).padStart(2, '0')}-${garment.id}.${kind.ext}`;
  await store.writeFile(guest, file, resultBuffer);

  const tryon = {
    id: crypto.randomBytes(6).toString('hex'),
    n,
    garmentId: garment.id,
    name: garment.name,
    piece: garment.piece,
    price: garment.price,
    file,
    mime: kind.mime,
    occasion: job.occasion,
    note: stylist.stylistNote({ garment, occasion: job.occasion }),
    inSelection: true,
    simulated,
    createdAt: new Date().toISOString(),
  };
  guest.tryons.push(tryon);
  await store.save(guest);

  job.tryon = tryon;
  job.status = 'completed';
}

function friendlyError(err) {
  switch (err.code) {
    case 'GARMENT_IMAGE_MISSING':
      return 'This piece is still being photographed for the salon. May we show you another?';
    case 'INSUFFICIENT_CREDITS':
      return 'The atelier is momentarily unavailable. Please allow us a moment and try again.';
    case 'CUSTOMER_IMAGE_REQUIRED':
    case 'NO_PORTRAIT':
      return 'We could not find your portrait. Kindly share it once more.';
    case 'TIMEOUT':
      return 'The atelier is taking longer than we would like. Shall we try once more?';
    default:
      return 'A thread slipped in the atelier. Shall we try that again?';
  }
}

module.exports = { start, get, setOccasion, publicJob };
