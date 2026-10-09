'use strict';

/**
 * Guest store.
 *
 * Every guest owns one private folder under storage/guests/ — outside the
 * public web root — holding their portrait, every try-on they generate,
 * their profile (guest.json) and their final selection (selection.json).
 *
 * Folder name:  <first-name-slug>-<yyyymmdd>-<id prefix>
 * (before the guest has given a name: guest-<yyyymmdd>-<id prefix>)
 *
 * Access is granted by an unguessable bearer token issued at creation;
 * only its SHA-256 hash is persisted.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const ROOT = config.paths.guests;
const ID_RE = /^[a-f0-9]{24}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,96}$/i;

/** id -> guest record (write-through cache) */
const guests = new Map();
/** digits-only phone -> guest id, for guests awaiting a WhatsApp portrait */
const awaitingPortrait = new Map();
/** id -> promise chain, serialises writes per guest */
const writeChains = new Map();

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const digits = (phone) => String(phone || '').replace(/\D/g, '');

function dateStamp(iso) {
  return (iso || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
}

function slugify(name) {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'guest';
}

function folderPath(guest) {
  return path.join(ROOT, guest.folder);
}

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function init() {
  await fs.mkdir(ROOT, { recursive: true });
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(ROOT, entry.name, 'guest.json'), 'utf8');
      const guest = JSON.parse(raw);
      if (!ID_RE.test(guest.id)) continue;
      guest.folder = entry.name;
      guests.set(guest.id, guest);
      if (guest.whatsapp?.awaitingPortrait && guest.whatsapp.phone) {
        awaitingPortrait.set(digits(guest.whatsapp.phone), guest.id);
      }
    } catch {
      /* not a guest folder — ignore */
    }
  }
  return guests.size;
}

async function create({ greeting }) {
  const id = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = new Date().toISOString();

  const guest = {
    id,
    folder: `guest-${dateStamp(createdAt)}-${id.slice(0, 8)}`,
    tokenHash: sha256(token),
    createdAt,
    greeting,
    profile: {},
    photo: null,
    genlook: null,
    whatsapp: {},
    tryons: [],
    finale: null,
  };

  await fs.mkdir(folderPath(guest), { recursive: true });
  guests.set(id, guest);
  await save(guest);
  return { guest, token };
}

function get(id) {
  if (!ID_RE.test(String(id || ''))) return null;
  return guests.get(id) || null;
}

function verifyToken(guest, token) {
  if (!guest || typeof token !== 'string' || token.length < 20) return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(guest.tokenHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function save(guest) {
  const prev = writeChains.get(guest.id) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => {
      guest.updatedAt = new Date().toISOString();
      return writeJsonAtomic(path.join(folderPath(guest), 'guest.json'), guest);
    });
  writeChains.set(guest.id, next);
  return next;
}

/** Rename the guest's folder to carry their name, once known. */
async function assignName(guest, name) {
  const target = `${slugify(name.split(/\s+/)[0])}-${dateStamp(guest.createdAt)}-${guest.id.slice(0, 8)}`;
  if (target === guest.folder) return;
  await (writeChains.get(guest.id) || Promise.resolve()).catch(() => {});
  await fs.rename(folderPath(guest), path.join(ROOT, target));
  guest.folder = target;
}

function filePath(guest, filename) {
  if (!FILE_RE.test(filename) || filename.includes('..')) return null;
  const full = path.join(folderPath(guest), filename);
  return full.startsWith(folderPath(guest) + path.sep) ? full : null;
}

async function writeFile(guest, filename, buffer) {
  const full = filePath(guest, filename);
  if (!full) throw new Error(`Refusing unsafe filename: ${filename}`);
  await fs.writeFile(full, buffer);
  return filename;
}

async function readFile(guest, filename) {
  const full = filePath(guest, filename);
  if (!full) throw new Error(`Refusing unsafe filename: ${filename}`);
  return fs.readFile(full);
}

async function writeJson(guest, filename, data) {
  const full = filePath(guest, filename);
  if (!full) throw new Error(`Refusing unsafe filename: ${filename}`);
  await writeJsonAtomic(full, data);
}

function awaitPortraitFrom(guest, phone) {
  for (const [key, id] of awaitingPortrait) if (id === guest.id) awaitingPortrait.delete(key);
  awaitingPortrait.set(digits(phone), guest.id);
  guest.whatsapp = { ...guest.whatsapp, phone, awaitingPortrait: true, requestedAt: new Date().toISOString() };
}

function findAwaitingPortrait(phone) {
  const id = awaitingPortrait.get(digits(phone));
  return id ? get(id) : null;
}

function portraitReceived(guest) {
  awaitingPortrait.delete(digits(guest.whatsapp?.phone));
  guest.whatsapp = { ...guest.whatsapp, awaitingPortrait: false, receivedAt: new Date().toISOString() };
}

module.exports = {
  init,
  create,
  get,
  verifyToken,
  save,
  assignName,
  filePath,
  writeFile,
  readFile,
  writeJson,
  awaitPortraitFrom,
  findAwaitingPortrait,
  portraitReceived,
};
