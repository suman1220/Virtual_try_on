'use strict';

const store = require('../services/guest-store');
const { HttpError } = require('../lib/http-error');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function headers(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

/** Small fixed-window limiter per IP — sufficient for a single instance. */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > max) return next(new HttpError(429, 'rate_limited', 'Please allow us a moment.'));
    next();
  };
}

/** Resolve :id to a guest and require their bearer token. */
function requireGuest(req, res, next) {
  const guest = store.get(req.params.id);
  const token = req.get('x-guest-token');
  if (!guest || !store.verifyToken(guest, token)) {
    return next(new HttpError(401, 'unauthorised', 'Your appointment could not be found.'));
  }
  req.guest = guest;
  next();
}

module.exports = { headers, rateLimit, requireGuest };
