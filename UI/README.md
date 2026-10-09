# SOLVÈNE — Private Salon

A virtual fitting appointment for a luxury house. The guest shares a
full-length portrait, gives their measure and height, and is then dressed in
each piece of the collection by the genlook.app try-on engine. At the end,
every look is gathered into their selection, sent to them on WhatsApp, and
sealed with a personal letter from the house.

```
Prelude → I Portrait → II Measure → III Introductions → IV Height
        → V Salon ⇄ Atelier (the waiting ritual) → VI Fitting → VII Selection
```

## Run

```bash
npm install
cp .env.example .env      # then replace the placeholder keys
npm start                 # http://localhost:3000
```

With placeholder keys the app runs in **atelier preview mode**: try-ons are
simulated (the guest's own portrait is returned after ~10 s, so the full
waiting ritual can be seen) and WhatsApp messages are printed to the console.
Replace the keys and restart to go live. Nothing else changes.

## Structure

```
server/
  index.js                 Express app: security headers, routes, static files
  config.js                Every key and setting, read from .env
  data/catalog.json        Garment names, prices, descriptions, atelier notes
  data/sizes.js            XS–XXXL measurement guide (placeholder values)
  routes/public.js         GET /api/config, GET /api/catalog
  routes/guests.js         Appointment, portrait, profile, fittings, selection
  routes/webhooks.js       WhatsApp webhook (verification + inbound photos)
  services/guest-store.js  Per-guest private folders and token auth
  services/catalog.js      Reads catalog.json and the catalog image folder
  services/genlook.js      genlook.app Try-On API client
  services/fittings.js     Background try-on jobs; saves every result
  services/whatsapp.js     WhatsApp Cloud API client
  services/selection.js    Builds the cart, sends looks on WhatsApp
  services/stylist.js      Greetings, stylist notes, the closing letter
public/
  index.html, css/maison.css, js/*.js     The experience (no framework)
  catalog/                 ← garment images go here (see its README)
storage/guests/            ← one private folder per guest (not web-served)
```

## Catalog images

Put one image per garment in `public/catalog/`, named after its `image` key
in `server/data/catalog.json` (`aube.jpg`, `minuit.webp` …). Until a file
exists, the salon shows a placeholder for that piece. Extra images dropped
in the folder appear automatically as "Price on request" pieces. The same
files are sent to genlook as the product image.

## Guest folders

Each guest gets `storage/guests/<first-name>-<yyyymmdd>-<id>/` holding:

| File                     | Contents                                   |
|--------------------------|--------------------------------------------|
| `portrait.jpg`           | The guest's full-length photograph         |
| `tryon-01-aube.jpg` …    | Every try-on result, numbered in order     |
| `guest.json`             | Profile, try-on history, stylist notes     |
| `selection.json`         | The final cart: pieces, prices, looks      |

The folder sits outside the public web root. Images are served only through
`/api/guests/:id/media/:file`, which needs the guest's bearer token (kept in
the browser's sessionStorage; only its SHA-256 hash is stored on disk).
Uploads are checked by their magic bytes, not their file extension, and
capped at 12 MB.

## genlook.app

Set `GENLOOK_API_KEY` (create one at https://app.genlook.app). The flow:

1. `POST /images/upload` — the portrait, once per guest (reused for 6 days)
2. `POST /try-on` — multipart: JSON `data` plus the catalog image as `product`
3. `GET /generations/{id}` — polled until `COMPLETED`; the result is
   downloaded straight away into the guest's folder

`GENLOOK_WATERMARK=false` removes the watermark on plans that allow it.

## WhatsApp (Meta Cloud API)

1. Set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
2. Webhook URL: `https://<your-domain>/webhooks/whatsapp`. Use the same
   `WHATSAPP_VERIFY_TOKEN` in Meta's settings, subscribe to `messages`, and set
   `WHATSAPP_APP_SECRET` so signatures are checked.
3. Register these templates in WhatsApp Manager:

**`solvene_portrait_request`** (Utility, no variables)
> Welcome to your private appointment at SOLVÈNE. Kindly reply to this
> message with one full-length photograph — head to toe, in soft natural
> light — and we shall prepare your fitting.

**`solvene_your_look`** (Marketing, IMAGE header, 3 variables)
> {{1}}, here you are in {{2}}. {{3}} — With admiration, the Salon of SOLVÈNE

When the guest replies with a photo, the webhook matches their number to the
waiting appointment, downloads the image, checks it and files it as their
portrait. The screen picks it up within a few seconds.

When the guest is finished, each look is sent with the `solvene_your_look`
template, which works outside the 24-hour customer-service window. If
`WHATSAPP_TEMPLATE_LOOK` is empty, plain image messages are sent instead;
these only arrive if the guest has messaged the business in the last 24 hours.

## Production notes

- Run behind HTTPS (the camera only works on HTTPS or localhost). Set
  `TRUST_PROXY=1` when behind a reverse proxy.
- Fittings are tracked in memory and the rate limiter is per process. To run
  more than one instance, move both to a shared store such as Redis.
- Set a retention policy for `storage/guests/`. Genlook keeps uploads for at
  most 7 days, and results for 1 day (`keepForDays`).
