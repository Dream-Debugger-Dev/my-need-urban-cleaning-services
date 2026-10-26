/* ==========================================================================
   MyNeedUrban — diwali.js
   The Diwali 2026 layer for the customer site. The page itself (markup and
   styles) already carries the theme; this file brings it to life:

     - the countdown to Diwali (6 pm India time on Sunday 8 November) and the
       Dhanteras / Choti Diwali / Diwali chips
     - the five diyas you can light (all five: a fireworks finale)
     - sky lanterns, hanging lanterns, the turning rangoli, ambient fireworks,
       cursor sparkles, tap bursts and confetti (js/diwali-fx.js, only when
       effects are on)
     - the "paused for the festive season" cards and window
     - the greeting-card maker (js/diwali-card.js, loaded on demand)
     - a celebration when a booking is confirmed

   It does nothing at all unless js/diwali-boot.js has published
   window.MNU_FESTIVE (that is, in season). Every part is wrapped so that a
   failure in one never takes the page down with it.

   Preview:  ?diwali=2026-11-08   ?diwali=2026-11-08T17:59:40   Off: ?diwali=off
   ========================================================================== */
import { sprite, diya, lantern, rangoli, deco, garlandTile, ornamentTile, diyaRowTile, cursors } from './diwali-art.js?v=20261026a';
import { pauseOn } from './festive-pause.js?v=20261026a';

const F = window.MNU_FESTIVE;

const FX_URL = './diwali-fx.js?v=20261026a';
const CARD_URL = './diwali-card.js?v=20261026a';

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const pad = (n) => String(n).padStart(2, '0');
const guard = (name, fn) => { try { return fn(); } catch (err) { console.warn(`[diwali] ${name} failed`, err); return undefined; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  sget(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
  sset(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};

/**
 * import() that retries. On a visitor's very first visit the service worker installs and takes
 * control; a module fetch in flight at that instant can be aborted (net::ERR_ABORTED). The file
 * is fine, so a short pause and another go always works.
 */
async function loadModule(url) {
  let err;
  for (let i = 0; i < 3; i++) {
    try { return await import(i ? `${url}&retry=${i}` : url); }
    catch (e) { err = e; await sleep(350 * (i + 1)); }
  }
  throw err;
}
const domReady = () => (document.readyState === 'loading'
  ? new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }))
  : Promise.resolve());

// ─── State ────────────────────────────────────────────────────────────────────
let fxOn = !!(F && F.fx);
let soundOn = store.get('mnu-dw-snd') === 'on';
let mod = null;                        // diwali-fx.js, once loaded
let hero = null;                       // the hero canvas
let overlay = null;                    // the full-screen canvas
let sound = null;
let lastBurst = 0, lastSpark = 0, lastX = -99, lastY = -99;

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(text, ms = 3400) {
  document.querySelectorAll('.dw-toast').forEach((n) => n.remove());
  const t = html(`<div class="dw-toast" role="status"></div>`);
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ─── Art ──────────────────────────────────────────────────────────────────────
function paintArt() {
  const colours = ['r', 'b', 'p', 'r'];
  $$('.dw-hang').forEach((el, i) => {
    el.innerHTML = lantern({ colour: colours[i % colours.length] });
    el.style.setProperty('--t', `${(5 + i * 0.8).toFixed(1)}s`);
    el.style.setProperty('--dl', `${(-i * 1.4).toFixed(1)}s`);
    el.style.setProperty('--a', `${3 + (i % 3)}deg`);
  });
  const mandala = $('dwRangoli');
  if (mandala) mandala.innerHTML = rangoli();
  $$('[data-art="flame"]').forEach((el) => { el.innerHTML = diya({ lit: true }); });
  $$('[data-art="lantern"]').forEach((el) => { el.innerHTML = lantern({ colour: 'p' }); });
  $$('[data-art="deco"]').forEach((el) => { el.innerHTML = deco(); });

  const s = root.style;                                       // tiles the stylesheet picks up
  s.setProperty('--dw-garland', garlandTile());
  s.setProperty('--dw-orn', ornamentTile());
  s.setProperty('--dw-diyarow', diyaRowTile());
}

/** Paper lanterns that drift up the hero. Still lanterns scattered in the sky when effects are off. */
function skyLanterns() {
  const host = $('dwSkyLanterns');
  if (!host) return;
  host.replaceChildren();
  const n = isPhone() ? 7 : 13;
  const phone = isPhone();
  const lo = phone ? 14 : 20, span = phone ? 18 : 26;                            // smaller and fainter on a phone, where they cross the text
  for (let i = 0; i < n; i++) {
    const w = lo + Math.random() * span;
    const el = html('<span class="dw-sl" aria-hidden="true"><i></i></span>');
    const v = (k, val) => el.style.setProperty(k, val);
    v('--x', `${(3 + Math.random() * 94).toFixed(1)}%`);
    v('--w', `${w.toFixed(0)}px`);
    v('--dur', `${(24 + Math.random() * 20).toFixed(1)}s`);
    v('--dl', `${(-Math.random() * 40).toFixed(1)}s`);
    v('--dx', `${((Math.random() - 0.5) * 140).toFixed(0)}px`);
    v('--swd', `${(5 + Math.random() * 5).toFixed(1)}s`);
    v('--sw', `${(10 + Math.random() * 20).toFixed(0)}px`);
    v('--o', ((0.4 + ((w - lo) / span) * 0.55) * (phone ? 0.55 : 1)).toFixed(2));   // bigger means nearer, so brighter
    v('--top', `${(8 + Math.random() * 62).toFixed(0)}%`);
    host.appendChild(el);
  }
}

// ─── Countdown ────────────────────────────────────────────────────────────────
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const istDay = (ms) => new Date(ms + 19800000).toISOString().slice(0, 10);

function countdown() {
  const count = $('dwCount');
  if (!count) return;
  const grid = count.querySelector('.dw-count-grid');
  const label = $('dwCountLabel');
  const note = $('dwCountNote');
  const done = $('dwCountDone');
  const bar = $('dwBarCount');
  const shown = {};
  let wasLive = null;
  let lastAria = '';

  const set = (id, value) => {
    const el = $(id);
    if (!el) return;
    const text = pad(value);
    if (shown[id] === text) return;
    const first = shown[id] === undefined;
    el.textContent = text;
    shown[id] = text;
    if (fxOn && !first) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  };

  const update = () => {
    const now = F.now();
    const left = Math.max(0, F.at - now);
    const day = istDay(now);
    const secs = Math.floor(left / 1000);
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const live = left > 0;

    $$('#dwStages .dw-stage').forEach((li) => {
      li.classList.toggle('is-today', li.dataset.date === day);
      li.classList.toggle('is-done', li.dataset.date < day);
    });

    if (live) {
      set('dwD', d); set('dwH', h); set('dwM', m); set('dwS', s);
      count.classList.remove('is-done');
      const dhanteras = F.stages[0].date;
      const away = daysBetween(day, F.diwali);
      if (label) label.textContent = day === F.diwali ? 'Diwali evening in' : 'Diwali in';
      if (note) {
        note.textContent = day === F.diwali ? 'Today is Diwali. Wishing you and your family a bright, clean and happy festival.'
          : day < dhanteras ? 'Get your home Diwali-ready: book your deep clean before Dhanteras (Fri 6 Nov).'
            : `Diwali is ${away} day${away === 1 ? '' : 's'} away. Wishing you a bright, clean and happy festival.`;
      }
      if (bar) bar.textContent = d > 0 ? `Diwali in ${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `Diwali in ${pad(h)}:${pad(m)}:${pad(s)}`;
      const aria = `${d} days, ${h} hours and ${m} minutes until Diwali`;
      if (grid && aria !== lastAria) { grid.setAttribute('aria-label', aria); lastAria = aria; }
    } else {
      count.classList.add('is-done');
      if (label) label.textContent = day === F.diwali ? 'It is Diwali' : 'Diwali 2026';
      if (done) done.textContent = day > F.diwali ? 'Thank you for celebrating with us' : 'Happy Diwali!';
      if (note) note.textContent = day > F.diwali ? 'Wishing you a bright, clean and happy year ahead.' : 'Wishing you light, joy and prosperity tonight.';
      if (bar) bar.textContent = day > F.diwali ? 'Wishing you a bright year ahead' : 'Happy Diwali!';
      if (grid) grid.setAttribute('aria-label', 'Diwali is here');
    }
    if (wasLive === true && !live) celebrate('finale');       // the moment the countdown reaches zero
    wasLive = live;
  };

  update();
  setInterval(update, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}

function kicker() {
  const sub = $('dwKickerSub');
  if (sub && F.phase === 'after') sub.textContent = 'Thank you for celebrating with us';
}

// ─── The festive pause ────────────────────────────────────────────────────────
function pauseCards() {
  const home = document.querySelector('.service-card[data-book="home"]');
  if (home && !home.querySelector('.dw-pick')) home.insertAdjacentHTML('afterbegin', '<span class="dw-pick"><i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i><span class="dw-pick-t"> Diwali pick</span></span>');

  if (!pauseOn()) return;
  for (const id of F.pause.ids) {
    $$(`.service-card[data-book="${id}"]`).forEach((card) => {
      if (card.classList.contains('is-paused')) return;
      card.classList.add('is-paused');
      const name = card.querySelector('h3')?.textContent || 'This service';
      card.setAttribute('aria-label', `${name}: paused for the festive season`);
      card.insertAdjacentHTML('beforeend', '<span class="dw-ribbon" aria-hidden="true"><i class="fa-solid fa-pause"></i> <span class="dw-rb-long">Paused for Diwali</span><span class="dw-rb-short">Paused</span></span>');
      const btn = card.querySelector('.svc-book-btn');
      if (btn) btn.textContent = 'Back after Diwali';
    });
    $$(`a[data-book="${id}"]`).forEach((a) => {
      if (a.classList.contains('is-paused')) return;
      a.classList.add('is-paused');
      a.insertAdjacentHTML('beforeend', ' <small class="dw-mini-tag">paused</small>');
    });
  }
}

const dlg = $('dwDialog');
let dlgReturn = null;
function dlgKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); return; }
  if (e.key !== 'Tab') return;
  const items = $$('button, a[href]', dlg).filter((n) => !n.disabled && n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function openDialog(title) {
  if (!dlg) return false;
  const what = title || 'This service';
  $('dwDlgText').textContent = `${what} bookings are paused for the festive season. We are not accepting bookings for small cleaning services (washroom, balcony, sofa, carpet and single-room cleaning) right now. Bathrooms and balconies are cleaned as part of our Full House Cleaning Package.`;
  dlgReturn = document.activeElement;
  dlg.classList.add('is-open');
  dlg.setAttribute('aria-hidden', 'false');
  root.classList.add('dw-lock');
  document.addEventListener('keydown', dlgKey, true);
  dlg.querySelector('.dw-gold-btn')?.focus({ preventScroll: true });
  return true;
}
function closeDialog() {
  if (!dlg || !dlg.classList.contains('is-open')) return;
  dlg.classList.remove('is-open');
  dlg.setAttribute('aria-hidden', 'true');
  root.classList.remove('dw-lock');
  document.removeEventListener('keydown', dlgKey, true);
  if (dlgReturn && document.body.contains(dlgReturn)) dlgReturn.focus({ preventScroll: true });
  dlgReturn = null;
}
function pauseDialog() {
  if (!dlg) return;
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-dw-close]')) closeDialog(); });
  // js/booking.js asks for this window when someone picks a paused service
  document.addEventListener('mnu:paused', (e) => { if (openDialog(e.detail && e.detail.title)) e.preventDefault(); });
}

// ─── The five diyas ───────────────────────────────────────────────────────────
function ledge() {
  const host = $('dwLedge');
  if (!host) return;
  const tints = ['#ffc83a', '#ff8a1f', '#e8467c', '#4fc3ff', '#7cf2a6'];
  host.innerHTML = tints.map((t, i) => `<button type="button" class="dw-diya" aria-pressed="false" aria-label="Light diya ${i + 1} of 5">${diya({ lit: false, ledge: true, tint: t })}</button>`).join('')
    + '<span class="dw-ledge-cap" id="dwLedgeCap" aria-live="polite">Tap each diya to light it</span>';
  const diyas = $$('.dw-diya', host);
  const cap = $('dwLedgeCap');

  const light = (b, quiet) => {
    b.classList.add('is-lit');
    b.setAttribute('aria-pressed', 'true');
    b.setAttribute('aria-label', `Diya ${diyas.indexOf(b) + 1} of 5, lit`);
    if (!quiet && overlay) { const r = b.getBoundingClientRect(); overlay.burst(r.left + r.width / 2, r.top + 14, '#ffd45e'); }
  };
  const status = () => {
    const n = diyas.filter((b) => b.classList.contains('is-lit')).length;
    cap.textContent = n === 0 ? 'Tap each diya to light it' : n < 5 ? `${n} of 5 lit` : 'Happy Diwali! May your home glow with joy';
    store.sset('mnu-dw-lit', String(n));
    return n;
  };

  const saved = Math.min(5, Number(store.sget('mnu-dw-lit')) || 0);       // keep them lit while browsing this visit
  diyas.slice(0, saved).forEach((b) => light(b, true));
  status();

  host.addEventListener('click', (e) => {
    const b = e.target.closest('.dw-diya');
    if (!b) return;
    if (b.classList.contains('is-lit')) { if (sound) sound.chime(990, 0.1); return; }
    light(b, false);
    const n = status();
    if (sound) sound.chime(520 + n * 110);
    if (n === 5) { celebrate('finale'); toast('May your home glow with joy. Happy Diwali!'); }
  });
}

// ─── Effects, sound and the cursor ────────────────────────────────────────────
function setCursor(on) {
  if (on && finePointer()) {
    const c = cursors();
    root.style.setProperty('--dw-cur', c.cur);
    root.style.setProperty('--dw-cur-go', c.go);
    root.classList.add('dw-cursor');
  } else root.classList.remove('dw-cursor');
}

async function ensureFx() {
  if (mod) return mod;
  try { mod = await loadModule(FX_URL); } catch (err) { console.warn('[diwali] effects failed to load', err); return null; }
  if (!sound) { sound = mod.createSound(); sound.on = soundOn; }
  return mod;
}

function onDown(e) {
  if (!overlay || e.button > 0) return;
  const t = e.target;
  if (!t.closest || t.closest('.dw-diya, .mnu-modal, .dw-dialog, .dw-fxpanel, input, textarea, select')) return;
  if (!t.closest('a, button, [role="button"], .service-card, summary, label, .btn')) return;
  const now = performance.now();
  if (now - lastBurst < 140) return;
  lastBurst = now;
  overlay.burst(e.clientX, e.clientY);
  if (sound) sound.pop(0.32);
}
function onMove(e) {
  if (!overlay || e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now - lastSpark < 34) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (dx * dx + dy * dy < 100) return;
  if (e.target.closest && e.target.closest('.mnu-modal, input, textarea, select, .dw-dialog')) return;
  lastSpark = now; lastX = e.clientX; lastY = e.clientY;
  overlay.sparkle(e.clientX, e.clientY);
}
function bindPointer(on) {
  document.removeEventListener('pointerdown', onDown, true);
  document.removeEventListener('pointermove', onMove);
  if (!on) return;
  document.addEventListener('pointerdown', onDown, true);
  if (finePointer()) document.addEventListener('pointermove', onMove, { passive: true });
}

async function applyFx(on, { user = false } = {}) {
  fxOn = on;
  root.classList.toggle('dw-fx', on);
  $('dwFxSwitch')?.setAttribute('aria-checked', String(on));
  if (user) store.set('mnu-dw-fx', on ? 'on' : 'off');
  setCursor(on);
  if (!on) {
    if (hero) { hero.stop(); hero = null; }
    overlay = null;
    bindPointer(false);
    return;
  }
  const m = await ensureFx();
  if (!m || !fxOn) return;
  const canvas = $('dwHeroCanvas');
  if (canvas && !hero) {
    hero = m.createHero(canvas, { phone: isPhone() });
    if (hero) hero.onBurst(() => { if (sound) sound.pop(0.18); });
  }
  if (!overlay) {
    overlay = m.createOverlay({ phone: isPhone() });
    overlay.onBurst(() => { if (sound) sound.pop(0.22); });
  }
  bindPointer(true);
}

function celebrate(kind) {
  if (!fxOn || !overlay) return;
  if (kind === 'finale') overlay.finale(); else overlay.confetti();
}

function controls() {
  const btn = $('dwFxBtn'), panel = $('dwFxPanel'), swFx = $('dwFxSwitch'), swSnd = $('dwSoundSwitch');
  if (!btn || !panel) return;
  const open = (v) => { panel.classList.toggle('is-open', v); btn.setAttribute('aria-expanded', String(v)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(!panel.classList.contains('is-open')); });
  document.addEventListener('click', (e) => { if (!panel.contains(e.target) && !btn.contains(e.target)) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  swFx?.setAttribute('aria-checked', String(fxOn));
  swSnd?.setAttribute('aria-checked', String(soundOn));
  swFx?.addEventListener('click', () => applyFx(!fxOn, { user: true }));
  swSnd?.addEventListener('click', async () => {
    soundOn = !soundOn;
    store.set('mnu-dw-snd', soundOn ? 'on' : 'off');
    swSnd.setAttribute('aria-checked', String(soundOn));
    const m = await ensureFx();
    if (m && sound) { sound.on = soundOn; if (soundOn) sound.chime(784, 0.2); }
  });
}

// ─── Greeting card, confirmed bookings ────────────────────────────────────────
function cards() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dw-card]');
    if (!b) return;
    b.disabled = true;
    try { const m = await loadModule(CARD_URL); await m.openCard({ opener: b }); }
    catch (err) { console.warn('[diwali] greeting card failed', err); toast('Sorry, the card could not be made on this device.'); }
    finally { b.disabled = false; }
  });
}

function bookingHook() {
  document.addEventListener('mnu:booked', () => {
    const wrap = document.querySelector('#bookingModal .booked-wrap');
    if (wrap && !wrap.querySelector('.dw-booked-greet')) wrap.insertAdjacentHTML('afterbegin', '<p class="dw-booked-greet">Happy Diwali!</p>');
    if (fxOn && overlay) { overlay.confetti(window.innerWidth / 2, window.innerHeight * 0.32, 80); setTimeout(() => celebrate('finale'), 350); }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  await domReady();
  guard('sprite', () => document.body.prepend(html(sprite())));
  guard('art', paintArt);
  guard('lanterns', skyLanterns);
  guard('countdown', countdown);
  guard('kicker', kicker);
  guard('pause cards', pauseCards);
  guard('pause window', pauseDialog);
  guard('diyas', ledge);
  guard('controls', controls);
  guard('cards', cards);
  guard('bookings', bookingHook);

  // The moving parts load once the page has settled, so they never slow the first paint
  const later = (fn) => (('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 1800 }) : setTimeout(fn, 700));
  later(() => { guard('effects', () => applyFx(fxOn)); });
}

if (F) main();
