'use strict';

const express = require('express');
const config = require('../config');
const catalog = require('../services/catalog');
const stylist = require('../services/stylist');
const { SIZES } = require('../data/sizes');
const { asyncRoute } = require('../lib/http-error');

const router = express.Router();

router.get('/config', (req, res) => {
  res.json({
    brand: config.brand,
    welcome: stylist.welcome(),
    sizes: SIZES,
    commerce: config.commerce,
    modes: { tryOnPreview: !config.genlook.live, whatsappPreview: !config.whatsapp.live },
  });
});

router.get(
  '/catalog',
  asyncRoute(async (req, res) => {
    const { collection, garments } = await catalog.list();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ collection, garments: garments.map(catalog.toPublic) });
  })
);

module.exports = router;
