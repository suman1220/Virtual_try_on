'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const env = (key, fallback = '') => (process.env[key] ?? fallback).toString().trim();

/** A value still holding its .env.example placeholder counts as "not configured". */
const isPlaceholder = (value) =>
  !value || /^(gk_your|your_|replace_|placeholder|changeme|xxx)/i.test(value);

const root = path.resolve(__dirname, '..');

const config = {
  port: Number(env('PORT', '3000')) || 3000,
  publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
  trustProxy: env('TRUST_PROXY', '0') === '1',

  brand: {
    name: 'SOLVÈNE',
    signature: 'The Salon of SOLVÈNE',
  },

  paths: {
    root,
    public: path.join(root, 'public'),
    catalogImages: path.join(root, 'public', 'catalog'),
    catalogData: path.join(root, 'server', 'data', 'catalog.json'),
    guests: path.join(root, 'storage', 'guests'),
  },

  limits: {
    photoBytes: 12 * 1024 * 1024,
  },

  genlook: {
    apiKey: env('GENLOOK_API_KEY'),
    baseUrl: env('GENLOOK_BASE_URL', 'https://api.genlook.app/tryon/v1').replace(/\/$/, ''),
    watermark: env('GENLOOK_WATERMARK', 'true') !== 'false',
    timeoutMs: Number(env('GENLOOK_TIMEOUT_MS', '120000')) || 120000,
  },

  whatsapp: {
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    graphVersion: env('WHATSAPP_GRAPH_VERSION', 'v21.0'),
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    templates: {
      portrait: env('WHATSAPP_TEMPLATE_PORTRAIT', 'solvene_portrait_request'),
      look: env('WHATSAPP_TEMPLATE_LOOK'),
      lang: env('WHATSAPP_TEMPLATE_LANG', 'en'),
    },
  },

  commerce: {
    currency: env('CURRENCY', 'INR'),
    locale: env('LOCALE', 'en-IN'),
    defaultDialCode: env('DEFAULT_DIAL_CODE', '+91'),
  },
};

config.genlook.live = !isPlaceholder(config.genlook.apiKey);
config.whatsapp.live =
  !isPlaceholder(config.whatsapp.token) && !isPlaceholder(config.whatsapp.phoneNumberId);

module.exports = config;
