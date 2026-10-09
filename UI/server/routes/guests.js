'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const store = require('../services/guest-store');
const catalog = require('../services/catalog');
const fittings = require('../services/fittings');
const selection = require('../services/selection');
const whatsapp = require('../services/whatsapp');
const stylist = require('../services/stylist');
const { SIZE_CODES } = require('../data/sizes');
const { detectImage } = require('../lib/image');
const { HttpError, asyncRoute } = require('../lib/http-error');
const { requireGuest } = require('../middleware/security');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.photoBytes, files: 1, fields: 4 },
});

const OCCASIONS = new Set(['candlelight', 'morning', 'journey', 'myself']);
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]{1,59}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const DIAL_RE = /^\+\d{1,4}$/;

/* ── helpers ─────────────────────────────────────────────────── */

function publicGuest(guest) {
  return {
    id: guest.id,
    greeting: guest.greeting,
    profile: guest.profile,
    hasPortrait: Boolean(guest.photo),
    portrait: guest.photo ? guest.photo.file : null,
    whatsapp: { awaitingPortrait: Boolean(guest.whatsapp?.awaitingPortrait) },
    tryons: guest.tryons,
    concluded: Boolean(guest.finale),
  };
}

function normalisePhone(dial, number) {
  const d = String(dial || config.commerce.defaultDialCode).trim();
  const n = String(number || '').replace(/[\s().-]/g, '').replace(/^0+/, '');
  if (!DIAL_RE.test(d) || !/^\d{6,14}$/.test(n) || (d.length - 1 + n.length) > 15) return null;
  return `${d}${n}`;
}

async function storePortrait(guest, buffer) {
  const kind = detectImage(buffer);
  if (!kind) throw new HttpError(415, 'unsupported_image', 'Kindly share a JPEG, PNG, WebP or HEIC photograph.');
  const file = `portrait.${kind.ext}`;
  await store.writeFile(guest, file, buffer);
  guest.photo = { file, mime: kind.mime, bytes: buffer.length, receivedAt: new Date().toISOString() };
  guest.genlook = null; // a new portrait must be uploaded afresh
  await store.save(guest);
}

/* ── appointment ─────────────────────────────────────────────── */

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const { guest, token } = await store.create({ greeting: stylist.welcome() });
    res.status(201).json({ token, guest: publicGuest(guest) });
  })
);

router.get('/:id', requireGuest, (req, res) => res.json({ guest: publicGuest(req.guest) }));

/* ── portrait: upload / camera ───────────────────────────────── */

router.post(
  '/:id/portrait',
  requireGuest,
  upload.single('portrait'),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'no_file', 'We did not receive a photograph.');
    await storePortrait(req.guest, req.file.buffer);
    res.json({ guest: publicGuest(req.guest) });
  })
);

/* ── portrait: by WhatsApp ───────────────────────────────────── */

router.post(
  '/:id/portrait/whatsapp',
  requireGuest,
  asyncRoute(async (req, res) => {
    const phone = normalisePhone(req.body.dialCode, req.body.number);
    if (!phone) throw new HttpError(400, 'invalid_phone', 'Kindly check the mobile number.');
    const guest = req.guest;
    store.awaitPortraitFrom(guest, phone);
    guest.profile.phone = phone;
    guest.profile.dialCode = req.body.dialCode;
    guest.profile.localNumber = String(req.body.number).replace(/\D/g, '');
    await store.save(guest);
    try {
      const result = await whatsapp.requestPortrait(phone);
      res.json({ requested: true, simulated: result.simulated });
    } catch (err) {
      console.error('[whatsapp] portrait request failed:', err.message);
      throw new HttpError(502, 'whatsapp_failed', 'We could not reach WhatsApp just now. Perhaps upload instead?');
    }
  })
);

router.get('/:id/portrait/status', requireGuest, (req, res) => {
  res.json({ received: Boolean(req.guest.photo), portrait: req.guest.photo?.file || null });
});

/* ── profile ─────────────────────────────────────────────────── */

router.patch(
  '/:id/profile',
  requireGuest,
  asyncRoute(async (req, res) => {
    const guest = req.guest;
    const body = req.body || {};
    const next = { ...guest.profile };
    const errors = {};

    if ('size' in body) {
      if (SIZE_CODES.has(body.size)) next.size = body.size;
      else errors.size = 'Kindly choose a size.';
    }
    if ('name' in body) {
      const name = String(body.name || '').trim().replace(/\s+/g, ' ');
      if (NAME_RE.test(name)) next.name = name;
      else errors.name = 'May we have your name as you would like to be addressed?';
    }
    if ('number' in body) {
      const phone = normalisePhone(body.dialCode, body.number);
      if (phone) {
        next.phone = phone;
        next.dialCode = body.dialCode;
        next.localNumber = String(body.number).replace(/\D/g, '');
      } else errors.number = 'This number does not look quite right.';
    }
    if ('email' in body) {
      const email = String(body.email || '').trim().toLowerCase();
      if (email.length <= 254 && EMAIL_RE.test(email)) next.email = email;
      else errors.email = 'This address does not look quite right.';
    }
    if ('heightCm' in body) {
      const h = Number(body.heightCm);
      if (Number.isInteger(h) && h >= 120 && h <= 220) next.heightCm = h;
      else errors.heightCm = 'Kindly choose your height.';
    }

    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'validation', message: 'A detail needs your attention.', fields: errors });
    }

    const nameChanged = next.name && next.name !== guest.profile.name;
    guest.profile = next;
    if (nameChanged) {
      guest.greeting = stylist.greeting(next.name);
      await store.assignName(guest, next.name);
    }
    await store.save(guest);
    res.json({ guest: publicGuest(guest) });
  })
);

/* ── private media ───────────────────────────────────────────── */

router.get(
  '/:id/media/:file',
  requireGuest,
  asyncRoute(async (req, res) => {
    const guest = req.guest;
    const file = req.params.file;
    const allowed = file === guest.photo?.file || guest.tryons.some((t) => t.file === file);
    const full = allowed && store.filePath(guest, file);
    if (!full) throw new HttpError(404, 'not_found', 'Not found.');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(full);
  })
);

/* ── fittings ────────────────────────────────────────────────── */

router.post(
  '/:id/fittings',
  requireGuest,
  asyncRoute(async (req, res) => {
    const guest = req.guest;
    if (!guest.photo) throw new HttpError(409, 'no_portrait', 'Kindly share your portrait first.');
    const garment = await catalog.get(String(req.body.garmentId || ''));
    if (!garment) throw new HttpError(404, 'unknown_garment', 'This piece is no longer in the salon.');
    const occasion = OCCASIONS.has(req.body.occasion) ? req.body.occasion : null;
    const job = fittings.start(guest, garment, { occasion });
    res.status(202).json({ fitting: fittings.publicJob(job) });
  })
);

router.get('/:id/fittings/:jobId', requireGuest, (req, res, next) => {
  const job = fittings.get(req.guest, req.params.jobId);
  if (!job) return next(new HttpError(404, 'not_found', 'This fitting could not be found.'));
  res.json({ fitting: fittings.publicJob(job) });
});

router.patch(
  '/:id/fittings/:jobId',
  requireGuest,
  asyncRoute(async (req, res) => {
    const job = fittings.get(req.guest, req.params.jobId);
    if (!job) throw new HttpError(404, 'not_found', 'This fitting could not be found.');
    if (!OCCASIONS.has(req.body.occasion)) throw new HttpError(400, 'invalid_occasion', 'Unknown occasion.');
    await fittings.setOccasion(req.guest, job, req.body.occasion);
    res.json({ fitting: fittings.publicJob(job) });
  })
);

/* ── selection ───────────────────────────────────────────────── */

router.patch(
  '/:id/tryons/:tryonId',
  requireGuest,
  asyncRoute(async (req, res) => {
    const t = req.guest.tryons.find((x) => x.id === req.params.tryonId);
    if (!t) throw new HttpError(404, 'not_found', 'Not found.');
    t.inSelection = Boolean(req.body.inSelection);
    await store.save(req.guest);
    res.json({ guest: publicGuest(req.guest) });
  })
);

router.get('/:id/selection', requireGuest, (req, res) => res.json({ selection: selection.build(req.guest) }));

router.post(
  '/:id/conclude',
  requireGuest,
  asyncRoute(async (req, res) => {
    const guest = req.guest;
    if (!guest.profile.name) throw new HttpError(409, 'no_profile', 'Kindly complete your details first.');
    const result = await selection.conclude(guest);
    res.json(result);
  })
);

module.exports = router;
