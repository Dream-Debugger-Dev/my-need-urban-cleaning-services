/* ===============================
   MyNeedUrban — app-shell.js
   Phone app chrome (<= 768px): bottom tab bar, Menu sheet, header account icon.

   Used by index.html (<body data-page="home">) and pages/account.html
   (<body data-page="account">). It asks booking.js to open the booking sheet
   with a 'mnu:book' event rather than importing it — importing booking.js
   from here would load a second copy and double every click handler.
   =============================== */
import { auth, onAuthStateChanged, signOut } from './firebase-config.js?v=20260924b';

const ROOT = new URL('../', import.meta.url);            // site root (this file is /js/app-shell.js)
const at = (p) => new URL(p, ROOT).href;
const PAGE = document.body.dataset.page || 'home';
const HOME = PAGE === 'home';
const PHONE = '+919613304724';
const WA = 'https://wa.me/919613304724?text=' +
  encodeURIComponent("Hi MyNeedUrban, I'd like to book a cleaning service");

let user = null;
let profile = null;
let lastFocus = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = () => (profile?.name || user?.displayName || '').trim().split(/\s+/)[0] || '';
const initial = () => (firstName() || user?.email || '').charAt(0).toUpperCase();

// ─── Actions ──────────────────────────────────────────────────────────────────
function book({ id = '', search = false } = {}) {
  if (HOME) {
    document.dispatchEvent(new CustomEvent('mnu:book', { detail: { id, search } }));
  } else {
    location.href = at(`index.html?book=${encodeURIComponent(id || 'root')}${search ? '&search=1' : ''}`);
  }
}

function openLogin() {
  const btn = document.getElementById('headerLoginBtn');
  if (HOME && btn) btn.click();                  // auth.js opens the login sheet
  else location.href = at(`index.html?login=1${PAGE === 'account' ? '&next=account' : ''}`);
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
const tabbar = document.createElement('nav');
tabbar.className = 'tabbar';
tabbar.setAttribute('aria-label', 'App navigation');
tabbar.innerHTML = `
  <a class="tab" data-tab="home" href="${HOME ? '#home' : at('index.html')}">
    <i class="fa-solid fa-house" aria-hidden="true"></i><span>Home</span></a>
  <a class="tab" data-tab="services" href="${HOME ? '#services' : at('index.html#services')}">
    <i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span>Services</span></a>
  <button type="button" class="tab tab-book" data-tab="book" aria-label="Book a service">
    <span class="tab-fab" aria-hidden="true"><i class="fa-solid fa-calendar-plus"></i></span><span>Book</span></button>
  <a class="tab" data-tab="bookings" href="${at('pages/account.html')}">
    <i class="fa-solid fa-receipt" aria-hidden="true"></i><span>Bookings</span></a>
  <button type="button" class="tab" data-tab="menu" aria-haspopup="dialog" aria-controls="menuSheet" aria-expanded="false">
    <i class="fa-solid fa-bars" aria-hidden="true"></i><span>Menu</span></button>`;
document.body.appendChild(tabbar);
document.body.classList.add('has-tabbar');

function setActive(key) {
  tabbar.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === key;
    t.classList.toggle('is-active', on);
    if (t.tagName === 'A') { if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }
  });
}
setActive(PAGE === 'account' ? 'bookings' : 'home');

tabbar.querySelector('[data-tab="book"]').addEventListener('click', () => book());
tabbar.querySelector('[data-tab="menu"]').addEventListener('click', () => openMenu());

// On the home page, light up "Services" while that section is on screen.
if (HOME) {
  const services = document.getElementById('services');
  if (services && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => setActive(e.isIntersecting ? 'services' : 'home'),
      { rootMargin: '-45% 0px -45% 0px' }).observe(services);
  }
}

// Hide the tab bar while typing, so it doesn't ride up on top of the keyboard.
const isTypingField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
  (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type)));
document.addEventListener('focusin', (e) => { if (isTypingField(e.target)) document.body.classList.add('kb-open'); });
document.addEventListener('focusout', () => setTimeout(() => {
  if (!isTypingField(document.activeElement)) document.body.classList.remove('kb-open');
}, 60));

// ─── Menu sheet ───────────────────────────────────────────────────────────────
const sheet = document.createElement('div');
sheet.className = 'msheet';
sheet.id = 'menuSheet';
sheet.setAttribute('role', 'dialog');
sheet.setAttribute('aria-modal', 'true');
sheet.setAttribute('aria-label', 'Menu');
sheet.innerHTML = '<div class="msheet-box"><div class="msheet-grip" aria-hidden="true"></div><div class="ms-body"></div></div>';
document.body.appendChild(sheet);
const sheetBody = sheet.querySelector('.ms-body');
const menuTab = tabbar.querySelector('[data-tab="menu"]');

const sectionHref = (id) => (HOME ? `#${id}` : at(`index.html#${id}`));
const link = (href, icon, label) =>
  `<a class="ms-link" href="${href}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}<i class="fa-solid fa-chevron-right ms-chev" aria-hidden="true"></i></a>`;
const action = (act, icon, label, cls = '') =>
  `<button type="button" class="ms-link ${cls}" data-act="${act}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}<i class="fa-solid fa-chevron-right ms-chev" aria-hidden="true"></i></button>`;

function renderMenu() {
  const signedIn = !!user;
  const name = firstName();
  const avatar = signedIn && initial() ? esc(initial()) : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  const canInstall = !!window.mnuInstall?.available?.();
  sheetBody.innerHTML = `
    <div class="ms-hello">
      <span class="ms-avatar">${avatar}</span>
      <div>
        <strong>${signedIn ? `Hi${name ? ', ' + esc(name) : ''}!` : 'Welcome to MyNeedUrban'}</strong>
        <small>${signedIn ? esc(user.email || user.phoneNumber || '') : 'Log in to track your bookings'}</small>
      </div>
    </div>
    <div class="ms-grid">
      <button type="button" class="ms-tile is-primary" data-act="book"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i>Book a service</button>
      <button type="button" class="ms-tile" data-act="search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>Search services</button>
      <a class="ms-tile" href="tel:${PHONE}"><i class="fa-solid fa-phone" aria-hidden="true"></i>Call us</a>
      <a class="ms-tile" href="${WA}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>WhatsApp us</a>
    </div>
    <div class="ms-list">
      ${signedIn ? link(at('pages/account.html'), 'fa-receipt', 'My bookings') : action('login', 'fa-right-to-bracket', 'Log in / Sign up')}
      ${link(sectionHref('how'), 'fa-list-check', 'How it works')}
      ${link(sectionHref('reviews'), 'fa-star', 'Reviews')}
      ${link(sectionHref('about'), 'fa-users', 'About us')}
      ${link(sectionHref('faq'), 'fa-circle-question', 'FAQ')}
      ${link(sectionHref('contact'), 'fa-phone-volume', 'Request a call back')}
      ${canInstall ? action('install', 'fa-mobile-screen', 'Install the app') : ''}
      ${signedIn ? action('logout', 'fa-right-from-bracket', 'Log out', 'is-danger') : ''}
    </div>
    <div class="ms-foot">
      <a href="${at('pages/privacy.html')}">Privacy</a>
      <a href="${at('pages/terms.html')}">Terms</a>
    </div>`;
}

function openMenu() {
  lastFocus = document.activeElement;
  renderMenu();
  sheet.classList.add('open');
  menuTab.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  setTimeout(() => sheet.querySelector('button, a')?.focus({ preventScroll: true }), 50);
}

function closeMenu({ restoreFocus = true } = {}) {
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open');
  menuTab.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  if (restoreFocus) lastFocus?.focus?.({ preventScroll: true });
}

sheet.addEventListener('click', async (e) => {
  if (e.target === sheet) { closeMenu(); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (e.target.closest('a')) { closeMenu({ restoreFocus: false }); return; }
  if (!act) return;
  closeMenu({ restoreFocus: false });
  if (act === 'book') book();
  else if (act === 'search') book({ search: true });
  else if (act === 'login') openLogin();
  else if (act === 'install') window.mnuInstall?.prompt?.();
  else if (act === 'logout') {
    await signOut(auth);
    if (!HOME) location.href = at('index.html');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
document.addEventListener('mnu:installable', () => { if (sheet.classList.contains('open')) renderMenu(); });

// ─── Header account icon (home page) ─────────────────────────────────────────
const acct = document.getElementById('hdrAcct');
acct?.addEventListener('click', () => {
  if (user) location.href = at('pages/account.html');
  else openLogin();
});

function paint() {
  if (acct) {
    const letter = user ? initial() : '';
    acct.classList.toggle('is-in', !!user);
    acct.innerHTML = user
      ? (letter ? esc(letter) : '<i class="fa-solid fa-user-check" aria-hidden="true"></i>')
      : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    acct.setAttribute('aria-label', user ? 'My bookings' : 'Log in');
  }
  if (sheet.classList.contains('open')) renderMenu();
}

onAuthStateChanged(auth, (u) => {
  user = u;
  if (!u) profile = null;
  paint();
});
// auth.js publishes the Firestore profile (with the customer's name) once loaded
document.addEventListener('mnu:auth', (e) => {
  user = e.detail?.user ?? null;
  profile = e.detail?.profile || null;
  paint();
});
if (window._mnuAuthState) {
  ({ user, profile } = window._mnuAuthState);
  paint();
}
