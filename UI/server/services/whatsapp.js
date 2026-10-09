'use strict';

/**
 * WhatsApp Cloud API (Meta Graph) client.
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * When the token / phone number id are placeholders, every outbound
 * message is logged instead of sent and reported as `simulated`.
 */

const crypto = require('crypto');
const config = require('../config');

const wa = config.whatsapp;
const GRAPH = `https://graph.facebook.com/${wa.graphVersion}`;

const toWaId = (phone) => String(phone || '').replace(/\D/g, '');

async function graph(path, init = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${wa.token}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `WhatsApp API responded ${res.status}`);
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

async function send(to, payload) {
  const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to: toWaId(to), ...payload };
  if (!wa.live) {
    console.log('[whatsapp:preview] →', JSON.stringify(message));
    return { simulated: true };
  }
  const body = await graph(`/${wa.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  return { simulated: false, id: body?.messages?.[0]?.id };
}

/** Template that invites the guest to reply with a full-length photograph. */
function requestPortrait(to) {
  return send(to, {
    type: 'template',
    template: { name: wa.templates.portrait, language: { code: wa.templates.lang } },
  });
}

function sendText(to, body) {
  return send(to, { type: 'text', text: { preview_url: false, body } });
}

async function uploadMedia(buffer, mime, filename) {
  if (!wa.live) return `preview-media-${crypto.randomBytes(4).toString('hex')}`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const body = await graph(`/${wa.phoneNumberId}/media`, { method: 'POST', body: form });
  return body.id;
}

/**
 * Deliver one look. Uses the approved "look" template (image header) when
 * configured — valid outside the 24-hour window — otherwise a plain image.
 */
async function sendLook(to, { buffer, mime, filename, firstName, pieceName, caption, note }) {
  const mediaId = await uploadMedia(buffer, mime, filename);
  if (wa.templates.look) {
    return send(to, {
      type: 'template',
      template: {
        name: wa.templates.look,
        language: { code: wa.templates.lang },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstName },
              { type: 'text', text: pieceName },
              { type: 'text', text: note },
            ],
          },
        ],
      },
    });
  }
  return send(to, { type: 'image', image: { id: mediaId, caption } });
}

/** Download inbound media (two-step: resolve URL, then fetch with bearer). */
async function fetchMedia(mediaId) {
  const meta = await graph(`/${encodeURIComponent(mediaId)}`);
  const res = await fetch(meta.url, {
    headers: { authorization: `Bearer ${wa.token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Media download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Validate X-Hub-Signature-256 when an app secret is configured. */
function verifySignature(rawBody, header) {
  if (!wa.appSecret) return true;
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', wa.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header.slice(7), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  live: wa.live,
  requestPortrait,
  sendText,
  sendLook,
  fetchMedia,
  verifySignature,
};
