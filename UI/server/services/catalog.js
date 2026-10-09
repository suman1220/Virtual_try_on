'use strict';

/**
 * Catalog service.
 *
 * Garment metadata lives in server/data/catalog.json.
 * Garment imagery lives in public/catalog/ — drop a file named after the
 * garment's "image" key with any common extension (aube.jpg, aube.webp …).
 *
 * Any extra image placed in public/catalog/ that is not described in the
 * JSON is still presented (named from its filename, price on request), so the
 * folder can be populated before the copywriting is final.
 */

const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { MIME_BY_EXT } = require('../lib/image');

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

let cache = { mtime: 0, data: null };

async function loadData() {
  const stat = await fs.stat(config.paths.catalogData);
  if (cache.data && stat.mtimeMs === cache.mtime) return cache.data;
  const data = JSON.parse(await fs.readFile(config.paths.catalogData, 'utf8'));
  cache = { mtime: stat.mtimeMs, data };
  return data;
}

async function listImageFiles() {
  try {
    const files = await fs.readdir(config.paths.catalogImages);
    return files.filter((f) => IMAGE_EXTS.includes(path.extname(f).slice(1).toLowerCase()));
  } catch {
    return [];
  }
}

const titleFromFile = (file) =>
  path
    .basename(file, path.extname(file))
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

async function list() {
  const [data, files] = await Promise.all([loadData(), listImageFiles()]);
  const byBase = new Map(files.map((f) => [path.basename(f, path.extname(f)).toLowerCase(), f]));
  const used = new Set();

  const garments = data.garments.map((g, i) => {
    const file = byBase.get(String(g.image || g.id).toLowerCase()) || null;
    if (file) used.add(file);
    return { ...g, index: i + 1, imageFile: file };
  });

  for (const file of files) {
    if (used.has(file)) continue;
    const base = path.basename(file, path.extname(file)).toLowerCase();
    garments.push({
      id: `extra-${base.replace(/[^a-z0-9]+/g, '-')}`,
      name: titleFromFile(file),
      category: 'piece',
      piece: 'From the atelier',
      material: '',
      price: null,
      image: base,
      tone: '#cfc4b5',
      description: 'A rare piece from the atelier, shown here first — for your eyes before anyone else’s.',
      notes: [],
      index: garments.length + 1,
      imageFile: file,
    });
  }

  return { collection: data.collection, garments };
}

async function get(id) {
  const { garments } = await list();
  return garments.find((g) => g.id === id) || null;
}

/** Public shape sent to the browser. */
function toPublic(g) {
  return {
    id: g.id,
    index: g.index,
    name: g.name,
    piece: g.piece,
    category: g.category,
    material: g.material,
    price: g.price,
    description: g.description,
    notes: g.notes || [],
    tone: g.tone,
    image: g.imageFile ? `/catalog/${encodeURIComponent(g.imageFile)}` : null,
  };
}

async function readImage(g) {
  if (!g.imageFile) return null;
  const full = path.join(config.paths.catalogImages, g.imageFile);
  const buffer = await fs.readFile(full);
  const ext = path.extname(g.imageFile).slice(1).toLowerCase();
  return { buffer, mime: MIME_BY_EXT[ext] || 'image/jpeg', filename: g.imageFile };
}

module.exports = { list, get, toPublic, readImage };
