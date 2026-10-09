/**
 * SOLVÈNE — the private appointment.
 *
 *   Prelude → I Portrait → II Measure → III Introductions → IV Height
 *           → V Salon ⇄ (Atelier) → VI Fitting → VII Selection
 */

import { api, ApiError } from './api.js';
import { $, $$, wait, curtain, stagger, splitLetters, splitWords, whisper, initCursor, formatMoney, reducedMotion } from './motion.js';
import { openCamera, prepareImage } from './camera.js';
import { createRuler, toImperial } from './ruler.js';
import { attachEmailSuggest } from './email-suggest.js';
import { createAtelier } from './atelier.js';
import { createLightbox } from './lightbox.js';

const SCENES = ['prelude', 'portrait', 'size', 'particulars', 'height', 'salon', 'reveal', 'finale'];

const app = {
  config: null,
  catalog: [],
  guest: null,
  scene: null,
  ruler: null,
  occasion: null,
  currentTryon: null,
  fittingBusy: false,
};

const atelier = createAtelier();
const lightbox = createLightbox();
const money = (n) => formatMoney(n, app.config.commerce);
const selectionLooks = () => (app.guest?.tryons || []).filter((t) => t.inSelection);

/* ════════════════════════ Scene machinery ════════════════════════ */

function activate(name) {
  const scene = $(`.scene[data-scene="${name}"]`);
  $$('.scene.is-active').forEach((s) => s.classList.remove('is-active'));
  scene.classList.add('is-active');
  stagger(scene);
  app.scene = name;
  document.body.dataset.scene = name;
  document.body.classList.toggle('is-dark', scene.dataset.tone === 'dark');
  window.scrollTo(0, 0);

  const chapter = $('.masthead__chapter');
  chapter.classList.toggle('is-on', Boolean(scene.dataset.chapter));
  $('[data-chapter-numeral]').textContent = scene.dataset.chapter || '';
  $('[data-chapter-title]').textContent = scene.dataset.chapterTitle || '';
  const progress = Math.max(0, SCENES.indexOf(name)) / (SCENES.length - 1);
  $('[data-progress]').style.setProperty('--p', progress);
  $('.masthead').style.setProperty('--mast-line', name === 'prelude' ? 0 : 1);

  updateSelectionBadge();
  enter[name]?.();

  const heading = $('h1, h2', scene);
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

function go(name, { instant = false } = {}) {
  if (instant || reducedMotion) return Promise.resolve(activate(name));
  return curtain(() => activate(name));
}

const enter = {
  particulars: () => prefillParticulars(),
  height() {
    if (!app.ruler) {
      app.ruler = createRuler({
        root: $('[data-ruler]'),
        track: $('[data-ruler-track]'),
        initial: app.guest.profile.heightCm || 165,
        onChange: (cm) => {
          $('[data-height-cm]').textContent = cm;
          $('[data-height-imperial]').textContent = toImperial(cm);
        },
      });
    }
    app.ruler.show(app.ruler.value);
    setTimeout(() => $('[data-ruler]').focus({ preventScroll: true }), 900);
  },
  salon() {
    renderGreeting();
    renderCatalog();
    $('[data-salon-close]').hidden = selectionLooks().length === 0;
  },
};

/* ════════════════════════ Prelude ════════════════════════ */

function initPrelude() {
  splitLetters($('[data-mark]'));
  $('[data-welcome]').textContent = app.config.welcome;

  const scene = $('.scene--prelude');
  const light = $('.prelude__light');
  scene.addEventListener('pointermove', (e) => {
    light.style.setProperty('--lx', `${(e.clientX / innerWidth) * 100}%`);
    light.style.setProperty('--ly', `${(e.clientY / innerHeight) * 100}%`);
  });

  $('[data-begin]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-busy');
    try {
      app.guest = app.guest || (await api.begin());
      await go(nextSceneFor(app.guest));
    } catch (err) {
      whisper(err.message);
    } finally {
      btn.classList.remove('is-busy');
    }
  });
}

/* ════════════════════════ I · Portrait ════════════════════════ */

function initPortrait() {
  const choices = $('[data-portrait-choices]');
  const form = $('[data-whatsapp-form]');
  const awaiting = $('[data-whatsapp-awaiting]');
  const img = $('[data-portrait-img]');
  const empty = $('[data-portrait-empty]');
  const veil = $('[data-portrait-veil]');
  const actions = $('[data-portrait-actions]');
  let poll = null;

  const showChoices = () => {
    clearInterval(poll);
    choices.hidden = false;
    form.hidden = true;
    awaiting.hidden = true;
  };

  const showPortrait = (url) => {
    img.src = url;
    img.hidden = false;
    empty.hidden = true;
    veil.hidden = true;
    actions.hidden = false;
  };

  app.showPortrait = showPortrait;

  const receive = async (file) => {
    veil.hidden = false;
    actions.hidden = true;
    try {
      const blob = await prepareImage(file);
      const { guest } = await api.uploadPortrait(blob, blob.type === 'image/jpeg' ? 'portrait.jpg' : file.name || 'portrait');
      api.forgetMedia(guest.portrait);
      app.guest = guest;
      showPortrait(URL.createObjectURL(blob));
      showChoices();
      whisper('What a beautiful canvas.');
    } catch (err) {
      veil.hidden = true;
      whisper(err.message);
    }
  };

  $('[data-file-input]').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) receive(file);
  });

  $('[data-open-camera]').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) return whisper('Your browser does not offer a camera here — kindly share a photograph.');
    const blob = await openCamera();
    if (blob) receive(blob);
  });

  $('[data-open-whatsapp]').addEventListener('click', () => {
    choices.hidden = true;
    form.hidden = false;
    $('input[name="number"]', form).focus();
  });

  $$('[data-cancel-whatsapp]').forEach((b) => b.addEventListener('click', showChoices));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    const err = $('[data-error]', form);
    const dialCode = form.dialCode.value.trim();
    const number = form.number.value.trim();
    err.textContent = '';
    if (!/^\+\d{1,4}$/.test(dialCode) || number.replace(/\D/g, '').length < 6) {
      err.textContent = 'Kindly check the mobile number.';
      return;
    }
    btn.classList.add('is-busy');
    try {
      const res = await api.requestWhatsAppPortrait(dialCode, number);
      app.guest.profile = { ...app.guest.profile, dialCode, localNumber: number.replace(/\D/g, '') };
      $('[data-awaiting-number]').textContent = `${dialCode} ${number}`;
      form.hidden = true;
      awaiting.hidden = false;
      if (res.simulated) whisper('Preview mode — the WhatsApp request is logged on the server.', 5200);
      clearInterval(poll);
      poll = setInterval(async () => {
        try {
          const status = await api.portraitStatus();
          if (status.received) {
            clearInterval(poll);
            app.guest = await api.resume();
            showPortrait(await api.media(app.guest.portrait));
            showChoices();
            whisper('Your portrait has arrived.');
          }
        } catch { /* keep listening */ }
      }, 2500);
    } catch (error) {
      err.textContent = error.message;
    } finally {
      btn.classList.remove('is-busy');
    }
  });

  $('[data-portrait-retake]').addEventListener('click', () => {
    img.hidden = true;
    empty.hidden = false;
    actions.hidden = true;
    showChoices();
  });

  $('[data-portrait-confirm]').addEventListener('click', () => go('size'));
}

/* ════════════════════════ II · Measure ════════════════════════ */

function initSizes() {
  const wrap = $('[data-sizes]');
  const next = $('[data-size-continue]');
  app.config.sizes.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'size';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(app.guest?.profile.size === s.code));
    btn.dataset.size = s.code;
    btn.dataset.reveal = '';
    btn.style.setProperty('--i', i + 3);
    btn.innerHTML = `
      <span class="size__code">${s.code}</span>
      <ul class="size__m">
        <li><span>Chest</span> <b>${s.chest}</b></li>
        <li><span>Waist</span> <b>${s.waist}</b></li>
        <li><span>Hips</span> <b>${s.hips}</b></li>
        <li><span>Shoulder</span> <b>${s.shoulder}</b></li>
      </ul>`;
    wrap.append(btn);
  });
  next.disabled = !app.guest?.profile.size;

  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.size');
    if (!btn) return;
    $$('.size', wrap).forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    next.disabled = false;
  });

  wrap.addEventListener('keydown', (e) => {
    const all = $$('.size', wrap);
    const i = all.indexOf(document.activeElement);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !d) return;
    e.preventDefault();
    const target = all[(i + d + all.length) % all.length];
    target.focus();
    target.click();
  });

  next.addEventListener('click', async () => {
    const chosen = $('.size[aria-checked="true"]', wrap);
    if (!chosen) return;
    next.classList.add('is-busy');
    try {
      app.guest = (await api.saveProfile({ size: chosen.dataset.size })).guest;
      await go('particulars');
    } catch (err) {
      whisper(err.message);
    } finally {
      next.classList.remove('is-busy');
    }
  });
}

/* ════════════════════════ III · Introductions ════════════════════════ */

function initParticulars() {
  const form = $('[data-particulars-form]');
  attachEmailSuggest(form.email, $('[data-email-suggest]'));

  const showErrors = (fields) => {
    $$('[data-error-for]', form).forEach((el) => {
      const msg = fields[el.dataset.errorFor] || '';
      el.textContent = msg;
      el.closest('.field').classList.toggle('is-invalid', Boolean(msg));
    });
  };

  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field?.classList.contains('is-invalid')) {
      field.classList.remove('is-invalid');
      const err = $('[data-error-for]', field);
      if (err) err.textContent = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(),
      dialCode: form.dialCode.value.trim(),
      number: form.number.value.trim(),
      email: form.email.value.trim(),
    };
    const errors = {};
    if (data.name.length < 2) errors.name = 'May we have your name as you would like to be addressed?';
    if (!/^\+\d{1,4}$/.test(data.dialCode) || data.number.replace(/\D/g, '').length < 6) errors.number = 'This number does not look quite right.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.email = 'This address does not look quite right.';
    showErrors(errors);
    if (Object.keys(errors).length) return;

    const btn = $('button[type="submit"]', form);
    btn.classList.add('is-busy');
    try {
      app.guest = (await api.saveProfile(data)).guest;
      await go('height');
    } catch (err) {
      if (err instanceof ApiError && err.fields) showErrors(err.fields);
      if (!Object.keys(err.fields || {}).length) whisper(err.message);
    } finally {
      btn.classList.remove('is-busy');
    }
  });
}

function prefillParticulars() {
  const p = app.guest?.profile || {};
  const form = $('[data-particulars-form]');
  if (p.name) form.name.value = p.name;
  if (p.email) form.email.value = p.email;
  if (p.localNumber) form.number.value = p.localNumber;
  $$('[data-dial]').forEach((input) => { input.value = p.dialCode || app.config.commerce.defaultDialCode; });
}

/* ════════════════════════ IV · Height ════════════════════════ */

function initHeight() {
  $('[data-height-continue]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-busy');
    try {
      app.guest = (await api.saveProfile({ heightCm: app.ruler.value })).guest;
      await go('salon');
    } catch (err) {
      whisper(err.message);
    } finally {
      btn.classList.remove('is-busy');
    }
  });
}

/* ════════════════════════ V · Salon ════════════════════════ */

const HANGER = '<svg viewBox="0 0 100 70" aria-hidden="true"><path d="M50 14a6 6 0 1 1 6 6c-3 0-6 2-6 6v3L8 56c-4 2-3 8 2 8h80c5 0 6-6 2-8L50 29"/></svg>';

function renderGreeting() {
  const el = $('[data-greeting]');
  if (el.dataset.text === app.guest.greeting) return;
  el.dataset.text = app.guest.greeting;
  splitWords(el, app.guest.greeting, app.guest.profile.name);
}

function renderCatalog() {
  const wrap = $('[data-catalog]');
  const worn = new Set(app.guest.tryons.map((t) => t.garmentId));
  if (wrap.childElementCount) {
    $$('.garment', wrap).forEach((card) => {
      const badge = $('.garment__worn', card);
      badge.hidden = !worn.has(card.dataset.id);
    });
    return;
  }

  app.catalog.forEach((g, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'garment';
    card.dataset.id = g.id;
    card.style.setProperty('--i', i % 8);
    card.style.setProperty('--tone', g.tone || '#cfc4b5');
    card.setAttribute('aria-label', `Try on ${g.name}, ${g.piece}, ${money(g.price)}`);

    const frame = document.createElement('span');
    frame.className = 'garment__frame';
    const placeholder = `<span class="garment__placeholder">${HANGER}<span></span></span>`;
    frame.innerHTML = placeholder;
    $('.garment__placeholder > span', frame).textContent = g.name;
    if (g.image) {
      const img = new Image();
      img.className = 'garment__img';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onload = () => $('.garment__placeholder', frame)?.remove();
      img.onerror = () => img.remove();
      img.src = g.image;
      frame.append(img);
    }
    const worn = document.createElement('span');
    worn.className = 'garment__worn';
    worn.textContent = 'Worn';
    worn.hidden = true;
    const cta = document.createElement('span');
    cta.className = 'garment__cta';
    cta.textContent = 'Try it on';
    frame.append(worn, cta);

    const meta = document.createElement('span');
    meta.className = 'garment__meta';
    const parts = [
      ['garment__no', `No. ${String(g.index).padStart(2, '0')}`],
      ['garment__name', g.name],
      ['garment__price', money(g.price)],
      ['garment__piece', g.piece],
      ['garment__desc', g.description],
    ];
    parts.forEach(([cls, text]) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = text;
      meta.append(el);
    });

    card.append(frame, meta);
    card.addEventListener('click', () => beginFitting(g));
    wrap.append(card);
  });
  renderCatalog();
}

/* ════════════════════════ The fitting ════════════════════════ */

async function beginFitting(garment) {
  if (app.fittingBusy) return;
  app.fittingBusy = true;
  let job = null;

  try {
    const portraitUrl = await api.media(app.guest.portrait);
    atelier.open({
      portraitUrl,
      garment,
      occasion: app.occasion,
      onOccasion: (o) => {
        app.occasion = o;
        if (job) api.setOccasion(job.id, o).catch(() => {});
      },
    });

    job = (await api.startFitting(garment.id, app.occasion)).fitting;
    while (job.status === 'processing') {
      await wait(1200);
      job = (await api.fitting(job.id)).fitting;
      atelier.phase(job.phase);
    }

    if (job.status !== 'completed') throw new Error(job.error || 'A thread slipped in the atelier. Shall we try that again?');

    const tryon = job.tryon;
    const url = await api.media(tryon.file);
    await decode(url);
    app.guest.tryons.push(tryon);
    app.currentTryon = tryon;
    await atelier.complete();
    renderReveal(tryon, url, garment);
    activate('reveal');
    bumpBadge();
    await atelier.close();
  } catch (err) {
    atelier.fail(err.message, {
      onRetry: () => { app.fittingBusy = false; beginFitting(garment); },
      onDismiss: () => atelier.close(),
    });
  } finally {
    app.fittingBusy = false;
  }
}

const decode = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onload = img.onerror = () => resolve();
  img.src = url;
  img.decode?.().then(resolve, resolve);
});

/* ════════════════════════ VI · Reveal ════════════════════════ */

function renderReveal(tryon, url, garment) {
  const img = $('[data-reveal-img]');
  img.src = url;
  img.alt = `You, wearing ${tryon.name}`;
  $('[data-reveal-index]').textContent = `Look ${String(app.guest.tryons.indexOf(tryon) + 1).padStart(2, '0')}`;
  $('[data-reveal-name]').textContent = tryon.name;
  $('[data-reveal-piece]').textContent = garment?.piece || tryon.piece;
  $('[data-reveal-note]').textContent = tryon.note;
  $('[data-reveal-price]').textContent = money(tryon.price);
  $('[data-reveal-preview]').hidden = !tryon.simulated;
  syncSelectionToggle();
}

function syncSelectionToggle() {
  const t = app.currentTryon;
  if (!t) return;
  $('[data-toggle-selection]').textContent = t.inSelection ? 'Remove from my selection' : 'Return to my selection';
}

function initReveal() {
  $('[data-try-another]').addEventListener('click', () => go('salon'));
  $('[data-open-lightbox]').addEventListener('click', () => lightbox.open($('[data-reveal-img]').src));
  $('[data-toggle-selection]').addEventListener('click', async () => {
    const t = app.currentTryon;
    await setInSelection(t, !t.inSelection);
    syncSelectionToggle();
    whisper(t.inSelection ? `${t.name} has returned to your selection.` : `${t.name} has been set aside.`);
  });
}

/* ════════════════════════ Selection drawer ════════════════════════ */

async function setInSelection(tryon, value) {
  try {
    app.guest = (await api.setInSelection(tryon.id, value)).guest;
    const fresh = app.guest.tryons.find((t) => t.id === tryon.id);
    Object.assign(tryon, fresh);
    if (app.currentTryon?.id === tryon.id) app.currentTryon = fresh;
    updateSelectionBadge();
    if (app.scene === 'salon') $('[data-salon-close]').hidden = selectionLooks().length === 0;
  } catch (err) {
    whisper(err.message);
  }
}

function updateSelectionBadge() {
  const count = selectionLooks().length;
  const btn = $('[data-open-selection]');
  $('[data-selection-count]').textContent = count;
  btn.hidden = !(app.guest?.tryons.length) || !['salon', 'reveal'].includes(app.scene);
}

function bumpBadge() {
  const el = $('[data-selection-count]');
  el.classList.remove('is-bump');
  void el.offsetWidth;
  el.classList.add('is-bump');
}

async function renderDrawer() {
  const list = $('[data-drawer-list]');
  list.textContent = '';
  if (!app.guest.tryons.length) {
    const li = document.createElement('li');
    li.className = 'drawer__empty';
    li.textContent = 'Your selection is waiting for its first piece.';
    list.append(li);
  }
  for (const t of app.guest.tryons) {
    const li = document.createElement('li');
    li.className = 'drawer__item' + (t.inSelection ? '' : ' is-out');
    const img = new Image();
    img.alt = '';
    api.media(t.file).then((u) => { img.src = u; });
    const text = document.createElement('div');
    const h = document.createElement('h4');
    h.textContent = t.name;
    const p = document.createElement('p');
    p.textContent = money(t.price);
    text.append(h, p);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = t.inSelection ? 'Set aside' : 'Keep';
    toggle.addEventListener('click', async () => {
      await setInSelection(t, !t.inSelection);
      renderDrawer();
    });
    img.addEventListener('click', async () => {
      closeDrawer();
      app.currentTryon = t;
      renderReveal(t, await api.media(t.file), app.catalog.find((g) => g.id === t.garmentId));
      go('reveal');
    });
    li.append(img, text, toggle);
    list.append(li);
  }
  const total = groupSelection().reduce((s, i) => s + (i.price || 0), 0);
  $('[data-drawer-total]').textContent = money(total);
}

function groupSelection() {
  const map = new Map();
  for (const t of selectionLooks()) if (!map.has(t.garmentId)) map.set(t.garmentId, t);
  return [...map.values()];
}

function openDrawer() {
  const drawer = $('[data-drawer]');
  renderDrawer();
  drawer.hidden = false;
  document.body.classList.add('is-locked');
  requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('is-open')));
}

async function closeDrawer() {
  const drawer = $('[data-drawer]');
  drawer.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  await wait(reducedMotion ? 0 : 800);
  drawer.hidden = true;
}

function initDrawer() {
  $('[data-open-selection]').addEventListener('click', openDrawer);
  $$('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('[data-drawer]').hidden) closeDrawer(); });
}

/* ════════════════════════ VII · Finale ════════════════════════ */

async function conclude(btn) {
  if (!selectionLooks().length) {
    whisper(app.guest.tryons.length ? 'Keep at least one piece in your selection.' : 'Choose a piece to try first — the salon is yours.');
    return;
  }
  btn?.classList.add('is-busy');
  try {
    const result = await api.conclude();
    if (!$('[data-drawer]').hidden) await closeDrawer();
    await renderFinale(result);
    await go('finale');
    revealLetter();
  } catch (err) {
    whisper(err.message);
  } finally {
    btn?.classList.remove('is-busy');
  }
}

function maskPhone(phone) {
  if (!phone) return '';
  const tail = phone.slice(-4);
  const dial = app.guest.profile.dialCode || '';
  return `${dial} •••• ${tail}`;
}

async function renderFinale({ selection, note, whatsapp }) {
  const list = $('[data-finale-items]');
  list.textContent = '';

  for (const [i, item] of selection.items.entries()) {
    const li = document.createElement('li');
    li.className = 'look';
    li.style.setProperty('--i', i);

    const images = document.createElement('div');
    const main = new Image();
    main.className = 'look__img';
    main.alt = `You, wearing ${item.name}`;
    main.src = await api.media(item.looks[item.looks.length - 1].file);
    images.append(main);
    if (item.looks.length > 1) {
      const more = document.createElement('div');
      more.className = 'look__more';
      for (const look of item.looks.slice(0, -1)) {
        const im = new Image();
        im.alt = '';
        im.src = await api.media(look.file);
        more.append(im);
      }
      images.append(more);
    }
    main.style.cursor = 'zoom-in';
    main.addEventListener('click', () => lightbox.open(main.src));

    const body = document.createElement('div');
    body.className = 'look__body';
    const name = document.createElement('h3');
    name.className = 'look__name';
    name.textContent = item.name;
    const piece = document.createElement('p');
    piece.className = 'look__piece';
    piece.textContent = `${item.piece}${item.size ? ` · Size ${item.size}` : ''}`;
    const quote = document.createElement('p');
    quote.className = 'look__note';
    quote.textContent = item.note;
    body.append(name, piece, quote);

    const price = document.createElement('span');
    price.className = 'look__price';
    price.textContent = money(item.price);

    li.append(images, body, price);
    list.append(li);
  }

  $('[data-finale-total]').textContent = money(selection.total);

  const wa = $('[data-finale-whatsapp]');
  const masked = maskPhone(app.guest.profile.phone);
  wa.textContent = '';
  const b = document.createElement('b');
  b.textContent = masked;
  if (whatsapp.sent && !whatsapp.simulated) {
    wa.append('Every look has been sent to you on WhatsApp, at ', b, '.');
  } else if (whatsapp.sent && whatsapp.simulated) {
    wa.append('Your looks are prepared for WhatsApp at ', b, ' — preview mode, messages are logged by the house.');
  } else {
    wa.append('Your looks are kept safely for you; we will send them to ', b, ' shortly.');
  }

  $('[data-letter-salutation]').textContent = note.salutation;
  const letterBody = $('[data-letter-body]');
  letterBody.textContent = '';
  note.paragraphs.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    letterBody.append(p);
  });
  $('[data-letter-closing]').textContent = note.closing;
  $('[data-letter-signature]').textContent = note.signature;
  $('[data-letter]').classList.remove('is-in');
}

function revealLetter() {
  const letter = $('[data-letter]');
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      letter.classList.add('is-in');
      io.disconnect();
    }
  }, { threshold: 0.25 });
  io.observe(letter);
}

function initFinale() {
  $$('[data-conclude]').forEach((btn) => btn.addEventListener('click', () => conclude(btn)));
  $('[data-return-salon]').addEventListener('click', () => go('salon'));
  $('[data-reserve]').addEventListener('click', () => {
    whisper('Thank you. Your client advisor will be in touch within the hour to make them yours.', 6000);
  });
}

/* ════════════════════════ Boot ════════════════════════ */

function nextSceneFor(guest) {
  if (!guest.hasPortrait) return 'portrait';
  const p = guest.profile;
  if (!p.size) return 'size';
  if (!p.name || !p.email || !p.phone) return 'particulars';
  if (!p.heightCm) return 'height';
  return 'salon';
}

async function boot() {
  initCursor();
  addEventListener('scroll', () => document.body.classList.toggle('is-scrolled', scrollY > 12), { passive: true });

  const [config, catalog] = await Promise.all([api.config(), api.catalog()]);
  app.config = config;
  app.catalog = catalog.garments;
  $('[data-collection-name]').textContent = catalog.collection;

  app.guest = await api.resume();

  initPrelude();
  initPortrait();
  initSizes();
  initParticulars();
  prefillParticulars();
  initHeight();
  initReveal();
  initDrawer();
  initFinale();

  $$('[data-dial]').forEach((input) => input.addEventListener('input', () => {
    input.value = '+' + input.value.replace(/[^\d]/g, '').slice(0, 4);
  }));

  if (app.guest?.hasPortrait) {
    app.showPortrait(await api.media(app.guest.portrait));
  }

  activate('prelude');
}

boot().catch((err) => {
  console.error(err);
  whisper('The salon could not be opened. Kindly refresh the page.', 10000);
});
