'use strict';

/**
 * The guest's selection (cart) and the closing ceremony:
 * group every try-on by garment, price it, persist selection.json in the
 * guest's folder, deliver every look on WhatsApp and compose the letter.
 */

const store = require('./guest-store');
const whatsapp = require('./whatsapp');
const stylist = require('./stylist');
const config = require('../config');

const money = (amount) =>
  amount == null
    ? 'Price on request'
    : new Intl.NumberFormat(config.commerce.locale, {
        style: 'currency',
        currency: config.commerce.currency,
        maximumFractionDigits: 0,
      }).format(amount);

function build(guest) {
  const groups = new Map();
  for (const t of guest.tryons) {
    if (!t.inSelection) continue;
    if (!groups.has(t.garmentId)) {
      groups.set(t.garmentId, {
        garmentId: t.garmentId,
        name: t.name,
        piece: t.piece,
        price: t.price,
        size: guest.profile.size || null,
        quantity: 1,
        note: t.note,
        looks: [],
      });
    }
    const item = groups.get(t.garmentId);
    item.looks.push({ tryonId: t.id, file: t.file });
    item.note = t.note; // the most recent note reads best
  }
  const items = [...groups.values()];
  const total = items.reduce((sum, i) => sum + (i.price || 0), 0);
  return { currency: config.commerce.currency, items, total, hasPriceOnRequest: items.some((i) => i.price == null) };
}

async function deliverOnWhatsApp(guest, selection) {
  const phone = guest.profile.phone;
  if (!phone) return { sent: false, reason: 'no_phone' };

  const name = stylist.firstName(guest.profile.name);
  let delivered = 0;
  let simulated = !whatsapp.live;

  try {
    await whatsapp.sendText(
      phone,
      `${name}, thank you for your private appointment at SOLVÈNE. Here are the looks you tried with us today — each one held for you for 48 hours.`
    );
    for (const item of selection.items) {
      for (const look of item.looks) {
        const t = guest.tryons.find((x) => x.id === look.tryonId);
        const buffer = await store.readFile(guest, look.file);
        const result = await whatsapp.sendLook(phone, {
          buffer,
          mime: t?.mime || 'image/jpeg',
          filename: look.file,
          firstName: name,
          pieceName: item.name,
          note: item.note,
          caption: `${item.name} · ${item.piece}\n${money(item.price)}\n\n${item.note}`,
        });
        simulated = simulated || result.simulated;
        delivered += 1;
      }
    }
    await whatsapp.sendText(
      phone,
      `Your selection: ${selection.items.length} piece${selection.items.length === 1 ? '' : 's'} · ${money(selection.total)}. Simply reply here whenever you wish to make them yours. — The Salon of SOLVÈNE`
    );
    return { sent: true, simulated, delivered };
  } catch (err) {
    console.error('[whatsapp] delivery failed:', err.message);
    return { sent: false, simulated, delivered, reason: 'delivery_failed' };
  }
}

async function conclude(guest) {
  const selection = build(guest);
  const note = stylist.closingNote({ profile: guest.profile, items: selection.items });
  const whatsappResult = await deliverOnWhatsApp(guest, selection);

  const record = {
    concludedAt: new Date().toISOString(),
    guest: { name: guest.profile.name, email: guest.profile.email, phone: guest.profile.phone, size: guest.profile.size },
    ...selection,
    whatsapp: whatsappResult,
  };
  await store.writeJson(guest, 'selection.json', record);
  guest.finale = { concludedAt: record.concludedAt, whatsapp: whatsappResult };
  await store.save(guest);

  return { selection, note, whatsapp: whatsappResult };
}

module.exports = { build, conclude };
