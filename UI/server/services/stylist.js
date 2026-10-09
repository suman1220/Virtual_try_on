'use strict';

/**
 * The house voice: greetings, stylist notes for each look, and the closing
 * letter. Written to feel personal — never generic, never effusive.
 */

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/* ── Greetings — three to four words, always ─────────────────── */

const WELCOMES = [
  'Tonight, you are expected.',
  'Welcome, radiant one.',
  'You were awaited.',
  'Beauty has arrived.',
  'The salon is yours.',
];

// Each yields 3–4 words once the first name is added.
const GREETINGS = [
  (n) => `Simply luminous, ${n}.`,
  (n) => `Radiant as ever, ${n}.`,
  (n) => `Pure grace, ${n}.`,
  (n) => `Beautifully you, ${n}.`,
  (n) => `Breathtaking tonight, ${n}.`,
  (n) => `Effortlessly radiant, ${n}.`,
  (n) => `The muse arrives, ${n}.`,
  (n) => `Quietly magnificent, ${n}.`,
];

const welcome = () => pick(WELCOMES);
const greeting = (name) => pick(GREETINGS)(firstName(name));

/* ── Stylist notes ───────────────────────────────────────────── */

const BY_CATEGORY = {
  gown: [
    '{piece} falls from you like light through silk curtains — every movement becomes a quiet event.',
    'In {piece}, you do not enter a room; you arrive in it.',
  ],
  dress: [
    '{piece} traces your line with absolute tenderness — it looks less worn than revealed.',
    'There is a stillness about you in {piece}, the kind people remember long after.',
  ],
  coat: [
    '{piece} settles on your shoulders as though it had been waiting for them — composed, warm, entirely yours.',
    'In {piece}, you carry winter like a privilege.',
  ],
  blazer: [
    '{piece} sharpens your silhouette without hardening it — quiet authority, beautifully held.',
    'Your shoulders give {piece} exactly the poise it was cut for.',
  ],
  jacket: [
    '{piece} turns you into the moment the evening was waiting for.',
    'In {piece}, every light in the room seems to find you first.',
  ],
  knit: [
    '{piece} wraps you in a softness that looks effortless and feels like a secret.',
    'You make {piece} look like the warmest thought of the season.',
  ],
  shirt: [
    '{piece} frames you with a clarity that is pure confidence — nothing more is needed.',
    'Your ease in {piece} is the definition of understated elegance.',
  ],
  skirt: [
    '{piece} moves with you like a held breath — graceful, unhurried, unforgettable.',
    'In {piece}, every step you take looks composed to music.',
  ],
  trouser: [
    '{piece} gives you a line of endless length — poised, modern, utterly assured.',
    'You walk in {piece} as if the whole city were a runway laid out for you.',
  ],
  piece: [
    '{piece} looks as though it were made with you in mind — and perhaps it was.',
  ],
};

const BY_OCCASION = {
  candlelight: 'By candlelight, you will be the quiet centre of every room.',
  morning: 'In morning light, it will look like you were born polished.',
  journey: 'Wherever you are going, you will arrive unforgettable.',
  myself: 'Wear it simply for yourself — you deserve exactly this feeling.',
};

function stylistNote({ garment, occasion }) {
  const line = pick(BY_CATEGORY[garment.category] || BY_CATEGORY.piece).replace('{piece}', garment.name);
  return BY_OCCASION[occasion] ? `${line} ${BY_OCCASION[occasion]}` : line;
}

/* ── Closing letter ──────────────────────────────────────────── */

function silhouetteLine(profile) {
  const h = Number(profile.heightCm);
  if (h >= 176) return 'Your height lets every line we cut fall long and uninterrupted — a rare gift for a tailor.';
  if (h && h <= 158) return 'Your proportions are exquisitely balanced; our atelier would refine each piece so it reads long and lithe on you.';
  return 'Your proportions carry each piece with a natural ease our tailors rarely see — very little would need to change.';
}

function closingNote({ profile, items }) {
  const name = firstName(profile.name) || 'dear guest';
  const count = items.length;
  const favourite = items.reduce((a, b) => ((b.price || 0) > (a.price || 0) ? b : a), items[0]);

  const opening = count
    ? `Thank you for spending this time with us. Watching you move through ${count === 1 ? 'this piece' : `these ${count} pieces`} was a genuine pleasure — you brought ${count === 1 ? 'it' : 'each one'} to life in a way no hanger ever could.`
    : 'Thank you for spending this time with us. It was a genuine pleasure to have you in the salon.';

  const middle = favourite
    ? `If we may confide one thing: ${favourite.name} was made for you. ${silhouetteLine(profile)}`
    : silhouetteLine(profile);

  const reserve = count
    ? `We have set your selection aside in your size${profile.size ? `, ${profile.size}` : ''}, for the next forty-eight hours — held for you, and only for you. Your looks are on their way to you now, so you may revisit them whenever you wish.`
    : 'Whenever you return, the salon will be ready for you.';

  return {
    salutation: `Dear ${name},`,
    paragraphs: [opening, middle, reserve],
    closing: 'You were, quite simply, beautiful today.',
    signature: 'With admiration, the Salon of SOLVÈNE',
  };
}

module.exports = { welcome, greeting, stylistNote, closingNote, firstName };
