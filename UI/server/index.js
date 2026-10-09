'use strict';

const express = require('express');
const multer = require('multer');
const config = require('./config');
const store = require('./services/guest-store');
const security = require('./middleware/security');
const { HttpError } = require('./lib/http-error');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(security.headers);

// Webhook first: it needs the raw body for signature verification.
app.use('/webhooks/whatsapp', require('./routes/webhooks'));

app.use(express.json({ limit: '32kb' }));
app.use('/api', security.rateLimit({ windowMs: 60_000, max: 300 }));
app.use('/api', require('./routes/public'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'Not found.')));

app.use(
  express.static(config.paths.public, {
    extensions: ['html'],
    setHeaders(res, file) {
      if (/[\\/]catalog[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=86400');
      else if (/\.(css|js)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'This photograph is a little too large (12 MB at most).' : 'The upload was not accepted.';
    return res.status(413).json({ error: err.code, message });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Malformed request.' });
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Something unexpected happened. Please try again.' });
});

store.init().then((count) => {
  app.listen(config.port, () => {
    const line = '─'.repeat(52);
    console.log(`\n  ${line}\n   ${config.brand.name}  ·  private salon\n  ${line}`);
    console.log(`   ${config.publicUrl}`);
    console.log(`   guests on file      ${count}`);
    console.log(`   genlook try-on      ${config.genlook.live ? 'live' : 'atelier preview (placeholder key)'}`);
    console.log(`   whatsapp            ${config.whatsapp.live ? 'live' : 'preview (messages logged)'}`);
    console.log(`  ${line}\n`);
  });
});
