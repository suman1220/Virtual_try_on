'use strict';

/**
 * House size guide. Approximate body measurements in centimetres.
 * Placeholder values — replace with the atelier's official grading.
 */
const SIZES = [
  { code: 'XS',   chest: 82,  waist: 64,  hips: 88,  shoulder: 37 },
  { code: 'S',    chest: 87,  waist: 69,  hips: 93,  shoulder: 39 },
  { code: 'M',    chest: 93,  waist: 75,  hips: 99,  shoulder: 41 },
  { code: 'L',    chest: 99,  waist: 81,  hips: 105, shoulder: 43 },
  { code: 'XL',   chest: 106, waist: 89,  hips: 111, shoulder: 45 },
  { code: 'XXL',  chest: 114, waist: 97,  hips: 118, shoulder: 47 },
  { code: 'XXXL', chest: 122, waist: 106, hips: 126, shoulder: 49 },
];

const SIZE_CODES = new Set(SIZES.map((s) => s.code));

module.exports = { SIZES, SIZE_CODES };
