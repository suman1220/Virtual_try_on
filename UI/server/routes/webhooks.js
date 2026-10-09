'use strict';

/**
 * WhatsApp Cloud API webhook.
 *   GET  — Meta verification handshake
 *   POST — inbound messages; a photo from a guest awaiting their portrait
 *          is downloaded, validated and placed in that guest's folder.
 */

const express = require('express');
const config = require('../config');
const store = require('../services/guest-store');
const whatsapp = require('../services/whatsapp');
const { detectImage } = require('../lib/image');

const router = express.Router();

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) {
    return res.status(200).type('text/plain').send(String(challenge));
  }
  res.sendStatus(403);
});

router.post('/', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!whatsapp.verifySignature(raw, req.get('x-hub-signature-256'))) return res.sendStatus(401);

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  // Acknowledge immediately; Meta retries slow webhooks.
  res.sendStatus(200);

  const messages = (payload.entry || [])
    .flatMap((e) => e.changes || [])
    .flatMap((c) => c.value?.messages || []);

  for (const message of messages) ingest(message).catch((err) => console.error('[webhook]', err.message));
});

async function ingest(message) {
  const guest = store.findAwaitingPortrait(message.from);
  if (!guest) return;

  const media =
    message.type === 'image'
      ? message.image
      : message.type === 'document' && /^image\//.test(message.document?.mime_type || '')
        ? message.document
        : null;

  if (!media) {
    await whatsapp.sendText(message.from, 'Whenever you are ready, simply reply with one full-length photograph — head to toe, in soft light.');
    return;
  }

  const buffer = await whatsapp.fetchMedia(media.id);
  const kind = detectImage(buffer);
  if (!kind || buffer.length > config.limits.photoBytes) {
    await whatsapp.sendText(message.from, 'Forgive us — we could not open that photograph. Might you send it once more?');
    return;
  }

  const file = `portrait.${kind.ext}`;
  await store.writeFile(guest, file, buffer);
  guest.photo = { file, mime: kind.mime, bytes: buffer.length, receivedAt: new Date().toISOString(), via: 'whatsapp' };
  guest.genlook = null;
  store.portraitReceived(guest);
  await store.save(guest);

  await whatsapp.sendText(message.from, 'Thank you — your portrait has arrived in the salon. Please return to your screen; we are ready for you.');
}

module.exports = router;
