'use strict';

/**
 * genlook.app Try-On API client.
 * Docs: https://genlook.app/docs/tryon-api/quickstart
 *
 *   POST /images/upload        multipart  file            -> { imageId }
 *   POST /try-on               multipart  data + product  -> { generationId, status }
 *   GET  /generations/{id}                                -> { status, resultImageUrl, ... }
 *
 * When GENLOOK_API_KEY still holds its placeholder, the service runs in
 * "atelier preview" mode: it waits a realistic interval and returns the
 * guest's own portrait, so the full journey can be rehearsed end to end.
 */

const config = require('../config');

const { apiKey, baseUrl, watermark, timeoutMs } = config.genlook;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GenlookError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code || 'GENLOOK_ERROR';
    this.status = status;
  }
}

async function call(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'x-api-key': apiKey, accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    throw new GenlookError(body.message || `Genlook responded ${res.status}`, body.code, res.status);
  }
  return body;
}

/** Upload the guest portrait once; the returned imageId is reusable for 7 days. */
async function uploadPerson({ buffer, mime, externalUserId }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `portrait.${mime.split('/')[1] || 'jpg'}`);
  form.append('crop', 'false');
  form.append('keepForDays', '7');
  if (externalUserId) form.append('externalUserId', externalUserId);
  const body = await call('/images/upload', { method: 'POST', body: form });
  if (!body.imageId) throw new GenlookError('Upload returned no imageId', 'NO_IMAGE_ID');
  return body.imageId;
}

async function createTryOn({ personImageId, product, productImage, externalUserId }) {
  const data = {
    products: [
      {
        externalId: `solvene-${product.id}`,
        title: `${product.name} — ${product.piece}`,
        description: product.description,
        images: [{ source: { fileKey: 'product' } }],
      },
    ],
    person: { image: { source: { id: personImageId } } },
    externalUserId,
    output: { watermark, keepForDays: 1 },
  };

  const form = new FormData();
  form.append('data', JSON.stringify(data));
  form.append('product', new Blob([productImage.buffer], { type: productImage.mime }), productImage.filename);

  const body = await call('/try-on', { method: 'POST', body: form });
  if (!body.generationId) throw new GenlookError('Try-on returned no generationId', 'NO_GENERATION');
  return body.generationId;
}

async function waitFor(generationId, onStatus) {
  const deadline = Date.now() + timeoutMs;
  let delay = 1000;
  while (Date.now() < deadline) {
    const gen = await call(`/generations/${encodeURIComponent(generationId)}`);
    onStatus?.(gen.status);
    if (gen.status === 'COMPLETED' && gen.resultImageUrl) return gen;
    if (gen.status === 'FAILED') {
      throw new GenlookError(gen.errorMessage || 'Generation failed', gen.errorCode || 'FAILED');
    }
    await sleep(delay);
    delay = Math.min(delay * 1.15, 2500);
  }
  throw new GenlookError('The generation took too long', 'TIMEOUT');
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new GenlookError(`Result download failed (${res.status})`, 'DOWNLOAD_FAILED');
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { live: config.genlook.live, uploadPerson, createTryOn, waitFor, download, GenlookError };
