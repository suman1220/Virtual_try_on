/**
 * Thin client for the SOLVÈNE API.
 * The guest's bearer token lives in sessionStorage only — closing the tab
 * ends the appointment on this device.
 */

const KEY = 'solvene.appointment';

let session = null;
try {
  session = JSON.parse(sessionStorage.getItem(KEY) || 'null');
} catch {
  session = null;
}

const persist = () => {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode — the session simply won't survive a reload */
  }
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Something unexpected happened.');
    this.status = status;
    this.code = body?.error;
    this.fields = body?.fields || {};
  }
}

async function request(path, { method = 'GET', json, form, raw } = {}) {
  const headers = {};
  if (session?.token) headers['x-guest-token'] = session.token;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(path, { method, headers, body, credentials: 'same-origin' });
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, {});
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const g = () => `/api/guests/${session.id}`;
const mediaCache = new Map();

export const api = {
  get hasSession() {
    return Boolean(session?.id && session?.token);
  },

  config: () => request('/api/config'),
  catalog: () => request('/api/catalog'),

  async begin() {
    const data = await request('/api/guests', { method: 'POST' });
    session = { id: data.guest.id, token: data.token };
    persist();
    return data.guest;
  },

  async resume() {
    if (!this.hasSession) return null;
    try {
      return (await request(g())).guest;
    } catch {
      session = null;
      persist();
      return null;
    }
  },

  end() {
    session = null;
    persist();
  },

  uploadPortrait(blob, filename = 'portrait.jpg') {
    const form = new FormData();
    form.append('portrait', blob, filename);
    return request(`${g()}/portrait`, { method: 'POST', form });
  },

  requestWhatsAppPortrait: (dialCode, number) =>
    request(`${g()}/portrait/whatsapp`, { method: 'POST', json: { dialCode, number } }),
  portraitStatus: () => request(`${g()}/portrait/status`),

  saveProfile: (fields) => request(`${g()}/profile`, { method: 'PATCH', json: fields }),

  startFitting: (garmentId, occasion) =>
    request(`${g()}/fittings`, { method: 'POST', json: { garmentId, occasion } }),
  fitting: (id) => request(`${g()}/fittings/${id}`),
  setOccasion: (id, occasion) => request(`${g()}/fittings/${id}`, { method: 'PATCH', json: { occasion } }),

  setInSelection: (tryonId, inSelection) =>
    request(`${g()}/tryons/${tryonId}`, { method: 'PATCH', json: { inSelection } }),
  conclude: () => request(`${g()}/conclude`, { method: 'POST' }),

  /** Private images are fetched with the bearer header and shown as blob URLs. */
  async media(file) {
    if (!file) return null;
    if (mediaCache.has(file)) return mediaCache.get(file);
    const promise = request(`${g()}/media/${encodeURIComponent(file)}`, { raw: true })
      .then((res) => res.blob())
      .then((blob) => URL.createObjectURL(blob));
    mediaCache.set(file, promise);
    promise.catch(() => mediaCache.delete(file));
    return promise;
  },

  forgetMedia(file) {
    const p = mediaCache.get(file);
    if (p) p.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    mediaCache.delete(file);
  },
};
