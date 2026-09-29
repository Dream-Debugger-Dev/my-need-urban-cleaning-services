/* ===============================
   MyNeedUrban — admin.js
   Live Orders dashboard for staff.

   - Staff sign in with their phone number (OTP). Access needs
     users/{uid}.role == 'admin' AND a phone sign-in, the same two checks
     the Firestore security rules enforce. The rules are the real lock; this
     page only explains what's needed. A password can never open this page's
     data, so guessing or leaking one is not enough to see customers.
   - Wrong codes and repeated OTP requests are slowed down (auth-guard.js),
     on top of Firebase's own limits.
   - Live order stream, bounded to the newest 300 ("Load older" adds more).
   - Search, status + service-date filters, clickable stats, CSV export.
   - One tap to Call, WhatsApp (message pre-written for the order's status)
     or Navigate. Status changes record who and when.
   - New-order alerts: chime, vibration, a system notification shown through
     the service worker (Android Chrome can't use `new Notification()`),
     and a count in the tab title.
   =============================== */
import {
  auth, db, VAPID_KEY,
  onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber, signOut,
  collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from './firebase-config.js?v=20260929a';
import { waitFor, failed, succeeded, smsWait, smsSent, inWords, countdown } from './auth-guard.js?v=20260929a';

// Refuse to run inside another website's frame (clickjacking: a hidden
// frame tricking staff into tapping "Cancel order"). Same-site frames are fine.
if (window.top !== window.self) {
  let sameSite = false;
  try { sameSite = window.top.location.origin === location.origin; } catch (_) { /* other site */ }
  if (!sameSite) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(location.href); } catch (_) { /* sandboxed frame */ }
    throw new Error('Live Orders cannot be shown inside another website.');
  }
}

const PAGE_SIZE = 300;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => Number(n || 0).toLocaleString('en-IN');
const DAY = 86400000;

// ─── Status model ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:    { label: 'New',         next: 'confirmed',  nextLabel: 'Confirm',       icon: 'fa-circle-check' },
  confirmed:  { label: 'Confirmed',   next: 'inProgress', nextLabel: 'Start job',     icon: 'fa-broom' },
  inProgress: { label: 'In progress', next: 'completed',  nextLabel: 'Mark complete', icon: 'fa-flag-checkered' },
  completed:  { label: 'Completed' },
  cancelled:  { label: 'Cancelled' },
};
const PREV = { confirmed: 'pending', inProgress: 'confirmed', completed: 'inProgress', cancelled: 'pending' };
const OPEN = new Set(['pending', 'confirmed', 'inProgress']);
const statusOf = (b) => (STATUS[b.status] ? b.status : 'pending');
const CHANNEL = { whatsapp: 'WhatsApp', call: 'Phone call', callback: 'Call-back', unknown: 'Website' };
const channelLabel = (b) => (b.channel ? CHANNEL[b.channel] || b.channel : (b.source === 'app' ? 'App' : 'Website'));

// ─── State ────────────────────────────────────────────────────────────────────
let me = null;
let pageSize = PAGE_SIZE;
let unsub = null;
let orders = [];              // newest first (query order)
let firstSnap = true;
let lastSize = 0;
const seen = new Set();
const fresh = new Map();      // id → time it arrived while the page was open
const openMore = new Set();   // cards with the "more" panel expanded
let unread = 0;
const view = { status: 'open', date: 'any', q: '', sort: 'new' };

// ─── Time helpers ─────────────────────────────────────────────────────────────
const millis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return Date.parse(ts) || 0;
};
function parseDay(s) {
  if (!s) return null;
  if (typeof s.toDate === 'function') return s.toDate();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayOf(b) {
  const d = parseDay(b.scheduledDate);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayLabel(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - todayStart()) / DAY);
  const base = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today · ${base}`;
  if (diff === 1) return `Tomorrow · ${base}`;
  if (diff === -1) return `Yesterday · ${base}`;
  return base;
}
function ago(ts) {
  const ms = millis(ts);
  if (!ms) return 'just now';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
const fmtDateTime = (ts) => (millis(ts)
  ? new Date(millis(ts)).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');

const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const fmt10 = (d) => `${d.slice(0, 5)} ${d.slice(5)}`;

/** True only for real Google Maps links (not look-alikes such as maps.google.com.evil.site). */
function isGoogleMaps(link) {
  try {
    const u = new URL(String(link));
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'maps.google.com') return true;
    return (u.hostname === 'www.google.com' || u.hostname === 'google.com') && u.pathname.startsWith('/maps');
  } catch (_) { return false; }
}
const EMAIL_OK = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

function mapsUrl(b) {
  if (isGoogleMaps(b.mapsLink)) return b.mapsLink;
  if (b.geo && Number.isFinite(+b.geo.lat) && Number.isFinite(+b.geo.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${+b.geo.lat},${+b.geo.lng}`;
  }
  const a = String(b.address || '').replace(/\n+/g, ', ').trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '';
}

function waUrl(b, phone) {
  const name = String(b.customerName || '').trim().split(/\s+/)[0] || 'there';
  const d = parseDay(b.scheduledDate);
  const when = d ? d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : 'your preferred date';
  const svc = b.serviceName || 'cleaning service';
  const oid = b.orderId ? ` (${b.orderId})` : '';
  const MSG = {
    pending:    `Hi ${name}, this is MyNeedUrban about your booking${oid} for ${svc} on ${when}. Can we confirm your slot?`,
    confirmed:  `Hi ${name}, your MyNeedUrban booking${oid} for ${svc} is confirmed for ${when}. Our team will reach on time.`,
    inProgress: `Hi ${name}, our team has started your ${svc}${oid}. We'll update you once it's done.`,
    completed:  `Hi ${name}, thank you for choosing MyNeedUrban! Your ${svc}${oid} is complete. If you're happy with the work, a Google review would mean a lot to us.`,
    cancelled:  `Hi ${name}, this is MyNeedUrban about your booking${oid} for ${svc}.`,
  };
  return `https://wa.me/91${phone}?text=${encodeURIComponent(MSG[statusOf(b)])}`;
}

// ─── Toast + live pill ────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const t = $('admToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function setLive(state, text) {
  $('liveState').dataset.state = state;
  $('liveTxt').textContent = text;
}
window.addEventListener('offline', () => setLive('off', 'Offline — showing saved orders'));
window.addEventListener('online', () => { if (unsub) setLive('wait', 'Reconnecting…'); });

// ─── Gate: sign-in / access ──────────────────────────────────────────────────
const AUTH_ERR = {
  'auth/invalid-phone-number': "That mobile number doesn't look right.",
  'auth/invalid-verification-code': 'That code is incorrect. Check the SMS and try again.',
  'auth/code-expired': 'That code has expired. Tap "Send a new code".',
  'auth/missing-verification-code': 'Enter the 6-digit code from the SMS.',
  'auth/too-many-requests': 'Too many attempts from this device. For safety, please wait a while and try again.',
  'auth/quota-exceeded': 'SMS limit reached for now. Please try again later.',
  'auth/captcha-check-failed': 'Security check failed. Refresh the page and try again.',
  'auth/invalid-app-credential': 'Security check failed. Refresh the page and try again.',
  'auth/operation-not-allowed': 'Phone sign-in is not switched on for India yet. The owner can allow it in Firebase → Authentication → Settings → SMS region policy.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/user-disabled': 'This account has been disabled.',
};

let verifier = null;       // invisible reCAPTCHA for the OTP request
let confirmation = null;   // waiting for the 6-digit code

// Invisible reCAPTCHA can be drawn into an element only once (a second
// verifier on the same element fails: "reCAPTCHA has already been rendered in
// this element"), so each code request gets a fresh element inside #siRecaptcha.
function resetVerifier() {
  try { verifier?.clear(); } catch (_) { /* already gone */ }
  verifier = null;
  const box = document.getElementById('siRecaptcha');
  if (box) box.textContent = '';
}

function newVerifier() {
  resetVerifier();
  const box = document.createElement('div');
  $('siRecaptcha').appendChild(box);
  verifier = new RecaptchaVerifier(auth, box, { size: 'invisible' });
  return verifier;
}

/** "+91 98765 43210" / "9876543210" / "09876543210" → "9876543210" ('' if not an Indian mobile). */
function mobile10(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

function showGate(html) {
  $('gate').innerHTML = html;
  $('gate').hidden = false;
  $('dash').hidden = true;
  ['alertsBtn', 'menuBtn'].forEach((id) => { $(id).hidden = true; });
}

function gateLoading(msg) {
  showGate(`<div class="g-card"><div class="spinner" aria-hidden="true"></div><p>${esc(msg)}</p></div>`);
}

function gateSignIn(note = '') {
  confirmation = null;
  resetVerifier();
  showGate(`
    <form class="g-card g-form" id="signInForm" novalidate>
      <img src="../assets/favicon/MyNeedUrban_favicon_v3.png" alt="" width="56" height="56" class="g-logo" />
      <h1>Staff sign-in</h1>
      <p>Enter your registered mobile number. We'll text you a 6-digit code.</p>
      <label for="siPhone"><span>Mobile number</span></label>
      <div class="g-phone">
        <span class="g-cc" aria-hidden="true">+91</span>
        <input id="siPhone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210" />
      </div>
      <label id="siCodeRow" hidden><span>6-digit code from the SMS</span>
        <input id="siCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
      </label>
      <p class="g-msg" id="siMsg" role="alert">${esc(note)}</p>
      <button class="a-btn a-primary" id="siBtn" type="submit">Send code</button>
      <button class="a-link" id="siResend" type="button" hidden>Send a new code</button>
      <button class="a-link" id="siChange" type="button" hidden>Use a different number</button>
      <p class="g-small g-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
        For your customers' safety, Live Orders only opens after a phone sign-in. A password can't open it.</p>
      <div id="siRecaptcha"></div>
    </form>`);

  const msg = (t, ok = false) => { $('siMsg').textContent = t; $('siMsg').classList.toggle('ok', ok); };
  let phone = '';

  const toPhoneStep = () => {
    confirmation = null;
    $('siCodeRow').hidden = true;
    $('siResend').hidden = true;
    $('siChange').hidden = true;
    $('siPhone').readOnly = false;
    $('siBtn').textContent = 'Send code';
  };

  async function sendCode() {
    const locked = waitFor('admin-otp');
    if (locked) { msg(`Too many wrong codes. For safety, please try again in ${inWords(locked)}.`); return; }
    const wait = smsWait();
    if (wait) { msg(`Please wait ${inWords(wait)} before asking for another code.`); return; }
    const btn = $('siBtn');
    btn.disabled = true;
    btn.textContent = 'Sending code…';
    try {
      confirmation = await signInWithPhoneNumber(auth, `+91${phone}`, newVerifier());
      smsSent();
      $('siCodeRow').hidden = false;
      $('siPhone').readOnly = true;
      $('siResend').hidden = false;
      $('siChange').hidden = false;
      btn.textContent = 'Verify and open Live Orders';
      msg(`Code sent to +91 ${fmt10(phone)}.`, true);
      countdown($('siResend'), smsWait(), 'Send a new code', (s) => `Send a new code in ${s}s`);
      $('siCode').value = '';
      $('siCode').focus();
    } catch (err) {
      console.warn('[admin] OTP send failed', err?.code || err);
      resetVerifier();
      toPhoneStep();
      msg(AUTH_ERR[err?.code] || 'Could not send the code. Please try again.');
    } finally {
      btn.disabled = false;
    }
  }

  async function verifyCode() {
    const code = $('siCode').value.replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { msg('Enter the 6-digit code from the SMS.'); $('siCode').focus(); return; }
    const wait = waitFor('admin-otp');
    if (wait) { msg(`Too many wrong codes. Please try again in ${inWords(wait)}.`); return; }
    const btn = $('siBtn');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      await confirmation.confirm(code);            // onAuthStateChanged takes over
      succeeded('admin-otp');
      resetVerifier();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Verify and open Live Orders';
      if (err?.code === 'auth/invalid-verification-code' && failed('admin-otp')) {
        toPhoneStep();                              // that code is burnt
        msg(`Too many wrong codes. For safety, request a new code in ${inWords(waitFor('admin-otp'))}.`);
        return;
      }
      msg(AUTH_ERR[err?.code] || 'Could not check the code. Please try again.');
    }
  }

  $('signInForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (confirmation) { verifyCode(); return; }
    phone = mobile10($('siPhone').value);
    if (!phone) { msg('Enter your 10-digit mobile number.'); $('siPhone').focus(); return; }
    sendCode();
  });
  $('siResend').addEventListener('click', () => { if (phone) sendCode(); });
  $('siChange').addEventListener('click', () => { toPhoneStep(); msg(''); $('siPhone').focus(); });
  $('siPhone').focus();
}

/** Signed in, but this account isn't an admin yet: show exactly how to grant it. */
async function gateDenied(user, hasProfile) {
  // A first phone sign-in has no profile yet. Create the normal customer
  // profile (the rules allow exactly this), so granting access later is a
  // one-field change in the console.
  if (!hasProfile) {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || '', phone: user.phoneNumber || '', role: 'customer', createdAt: serverTimestamp(),
      });
    } catch (e) { console.warn('[admin] could not create profile', e?.code || e); }
    if (auth.currentUser?.uid !== user.uid) return;
  }
  showGate(`
    <div class="g-card">
      <div class="g-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></div>
      <h1>No admin access</h1>
      <p><strong>${esc(user.phoneNumber || user.email || 'This account')}</strong> isn't an admin account.</p>
      <ol class="g-steps">
        <li>The owner opens <strong>Firebase console → Firestore Database → users</strong>.</li>
        <li>Opens the document named <code>${esc(user.uid)}</code>.</li>
        <li>Changes <code>role</code> from <code>customer</code> to <code>admin</code>, then this page opens after you sign in again.</li>
      </ol>
      <button class="a-btn a-ghost" id="copyUid" type="button"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copy this account's ID</button>
      <button class="a-link" id="denyOut" type="button">Sign in with another number</button>
    </div>`);
  $('copyUid').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(user.uid); toast('Account ID copied'); }
    catch (_) { toast(user.uid); }
  });
  $('denyOut').addEventListener('click', () => signOut(auth));
}

/** An admin account, but signed in with a password (or Google): phone sign-in required. */
function gatePhoneOnly() {
  showGate(`
    <div class="g-card">
      <div class="g-icon"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i></div>
      <h1>Phone sign-in needed</h1>
      <p>For your customers' safety, Live Orders only opens after signing in with your phone number (OTP).
         This session was signed in with a password.</p>
      <button class="a-btn a-primary" id="usePhone" type="button">Sign in with phone</button>
    </div>`);
  $('usePhone').addEventListener('click', () => signOut(auth));   // → phone sign-in form
}

function gateError(err, retry) {
  showGate(`
    <div class="g-card">
      <div class="g-icon warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <h1>Couldn't check your access</h1>
      <p>${esc(err?.code === 'unavailable' || !navigator.onLine ? 'You seem to be offline.' : 'Something went wrong while loading your account.')}</p>
      <button class="a-btn a-primary" id="gateRetry" type="button">Try again</button>
    </div>`);
  $('gateRetry').addEventListener('click', retry);
}

async function checkAccess(user) {
  gateLoading('Checking admin access…');
  let role = null;
  let hasProfile = false;
  let provider = '';
  try {
    const [snap, token] = await Promise.all([getDoc(doc(db, 'users', user.uid)), user.getIdTokenResult()]);
    hasProfile = snap.exists();
    role = hasProfile ? snap.data().role : null;
    provider = token?.signInProvider || '';
  } catch (err) {
    console.error('[admin] role check failed', err);
    if (auth.currentUser?.uid === user.uid) gateError(err, () => checkAccess(user));
    return;
  }
  if (auth.currentUser?.uid !== user.uid) return;
  if (role !== 'admin') { setLive('off', 'No access'); gateDenied(user, hasProfile); return; }
  if (provider !== 'phone') { setLive('off', 'Phone sign-in needed'); gatePhoneOnly(); return; }

  me = user;
  $('gate').hidden = true;
  $('dash').hidden = false;
  $('alertsBtn').hidden = false;
  $('menuBtn').hidden = false;
  $('whoami').textContent = user.email || user.phoneNumber || '';
  paintAlerts();
  listen();
  if (alertsOn && window.Notification?.permission === 'granted') registerPush();
}

onAuthStateChanged(auth, (user) => {
  stopListening();
  me = null;
  orders = [];
  // Wipe the previous session's customer data from the page — a shared
  // phone must not keep names, numbers and addresses around after sign-out.
  $('list').innerHTML = '';
  $('stats').innerHTML = '';
  $('q').value = '';
  view.q = '';
  seen.clear();
  fresh.clear();
  openMore.clear();
  clearUnread();
  if (!user) { setLive('off', 'Signed out'); gateSignIn(); return; }
  checkAccess(user);
});

// ─── Live stream ──────────────────────────────────────────────────────────────
function stopListening() {
  unsub?.();
  unsub = null;
}

function listen() {
  stopListening();
  firstSnap = true;
  setLive('wait', 'Connecting…');
  const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(pageSize));
  unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const cached = snap.metadata.fromCache;
    setLive(cached ? (navigator.onLine ? 'wait' : 'off') : 'on',
            cached ? (navigator.onLine ? 'Syncing…' : 'Offline — showing saved orders') : 'Live');

    const arrived = [];
    snap.docChanges().forEach((ch) => {
      if (ch.type !== 'added') return;
      const id = ch.doc.id;
      if (!firstSnap && !seen.has(id)) arrived.push({ id, ...ch.doc.data() });
      seen.add(id);
    });
    firstSnap = false;

    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    lastSize = snap.size;
    $('moreWrap').hidden = lastSize < pageSize;
    if (arrived.length) announce(arrived);
    render();
  }, (err) => {
    console.error('[admin] orders stream failed', err);
    setLive('off', err?.code === 'permission-denied' ? 'No permission' : 'Disconnected');
    $('list').innerHTML = `
      <div class="adm-empty warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <p>${err?.code === 'permission-denied'
          ? "The database refused this account. Check that its role is 'admin' and the security rules are deployed."
          : "Can't reach the database right now."}</p>
        <button class="a-btn a-primary" type="button" id="streamRetry">Try again</button></div>`;
    $('streamRetry')?.addEventListener('click', listen);
  });
}

$('moreBtn').addEventListener('click', () => {
  pageSize += PAGE_SIZE;
  listen();
});

// ─── Alerts ───────────────────────────────────────────────────────────────────
let alertsOn = localStorage.getItem('mnu-admin-alerts') === '1';
let audioCtx = null;

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (_) { /* no audio on this device */ }
}
// Browsers only allow sound after a tap, so arm it on the first interaction.
document.addEventListener('pointerdown', unlockAudio, { once: true });

function chime() {
  unlockAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1320, 1760].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const t = t0 + i * 0.18;
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.55);
  });
}

function paintAlerts() {
  const b = $('alertsBtn');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  b.setAttribute('aria-pressed', String(alertsOn));
  b.classList.toggle('on', alertsOn);
  b.innerHTML = alertsOn
    ? `<i class="fa-solid fa-bell" aria-hidden="true"></i><span>Alerts on</span>`
    : `<i class="fa-solid fa-bell-slash" aria-hidden="true"></i><span>Alerts off</span>`;
  b.title = alertsOn
    ? (perm === 'denied' ? 'Sound on. System notifications are blocked in this browser.' : 'Sound + notifications for new orders')
    : 'Turn on sound and notifications for new orders';
}

$('alertsBtn').addEventListener('click', async () => {
  alertsOn = !alertsOn;
  localStorage.setItem('mnu-admin-alerts', alertsOn ? '1' : '0');
  paintAlerts();
  if (!alertsOn) { toast('New-order alerts off'); return; }
  chime();                                 // this tap also unlocks audio
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (_) {}
  }
  paintAlerts();
  toast(window.Notification?.permission === 'denied'
    ? 'Sound on. Notifications are blocked — allow them in browser settings.'
    : 'Alerts on — keep this page open to hear new orders');
  registerPush();
});

/** Best-effort background push (arrives once the Cloud Functions are deployed). */
async function registerPush() {
  if (!me || !('serviceWorker' in navigator) || window.Notification?.permission !== 'granted') return;
  try {
    const { getMessaging, getToken, isSupported } =
      await import('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging.js');
    if (!(await isSupported())) return;
    const token = await getToken(getMessaging(), { vapidKey: VAPID_KEY });
    if (token) await updateDoc(doc(db, 'users', me.uid), { fcmToken: token });
  } catch (e) {
    console.info('[admin] background push not set up:', e?.code || e?.message || e);
  }
}

async function notify(b) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const d = parseDay(b.scheduledDate);
  const title = `New booking${b.orderId ? ` · ${b.orderId}` : ''}`;
  const body = `${b.serviceName || 'Cleaning'} — ${b.customerName || 'Guest'}${d ? ` · ${dayLabel(d)}` : ''}`;
  const opts = {
    body,
    icon: new URL('../assets/pwa/icon-192.png', location.href).href,
    badge: new URL('../assets/pwa/icon-maskable-192.png', location.href).href,
    tag: b.orderId || b.id,
    renotify: true,
    data: { url: location.href },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (_) { /* fall through */ }
  try { new Notification(title, opts); } catch (_) { /* unsupported in page context */ }
}

function announce(list) {
  const now = Date.now();
  list.forEach((b) => fresh.set(b.id, now));
  if (document.hidden || !document.hasFocus()) {
    unread += list.length;
    document.title = `(${unread}) New order${unread > 1 ? 's' : ''} — MNU Admin`;
  }
  toast(list.length === 1
    ? `New order: ${list[0].serviceName || 'booking'} — ${list[0].customerName || 'Guest'}`
    : `${list.length} new orders`);
  if (!alertsOn) return;
  chime();
  navigator.vibrate?.([220, 120, 220]);
  list.slice(0, 3).forEach(notify);
}

function clearUnread() {
  unread = 0;
  document.title = 'Live Orders — MyNeedUrban Admin';
}
window.addEventListener('focus', clearUnread);

// ─── Keep screen awake (for a counter tablet) ────────────────────────────────
let wakeLock = null;
let wantAwake = localStorage.getItem('mnu-admin-awake') === '1';

async function applyWake() {
  if (!('wakeLock' in navigator)) return;
  try {
    if (wantAwake && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; paintAwake(); });
    } else if (!wantAwake && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (_) { wakeLock = null; }
  paintAwake();
}
function paintAwake() {
  const b = $('awakeBtn');
  if (!('wakeLock' in navigator)) { b.hidden = true; return; }
  b.hidden = false;
  b.querySelector('span').textContent = wantAwake ? 'Keep screen awake: On' : 'Keep screen awake: Off';
}
$('awakeBtn').addEventListener('click', () => {
  wantAwake = !wantAwake;
  localStorage.setItem('mnu-admin-awake', wantAwake ? '1' : '0');
  applyWake();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { clearUnread(); applyWake(); }
});
paintAwake();
applyWake();

// ─── Menu ─────────────────────────────────────────────────────────────────────
function setMenu(open) {
  $('admMenu').hidden = !open;
  $('menuBtn').setAttribute('aria-expanded', String(open));
}
$('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); setMenu($('admMenu').hidden); });
document.addEventListener('click', (e) => { if (!e.target.closest('#admMenu')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
$('signOutBtn').addEventListener('click', () => { setMenu(false); signOut(auth); });

// ─── Filters ──────────────────────────────────────────────────────────────────
const STATUS_FILTERS = {
  open:       (b) => OPEN.has(statusOf(b)),
  pending:    (b) => statusOf(b) === 'pending',
  confirmed:  (b) => statusOf(b) === 'confirmed',
  inProgress: (b) => statusOf(b) === 'inProgress',
  completed:  (b) => statusOf(b) === 'completed',
  cancelled:  (b) => statusOf(b) === 'cancelled',
  all:        () => true,
};
const STATUS_LABELS = { open: 'Active', pending: 'New', confirmed: 'Confirmed', inProgress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', all: 'All' };
const DATE_FILTERS = {
  any:      () => true,
  today:    (b) => dayOf(b) === todayStart(),
  tomorrow: (b) => dayOf(b) === todayStart() + DAY,
  week:     (b) => { const d = dayOf(b); return d != null && d >= todayStart() && d < todayStart() + 7 * DAY; },
  overdue:  (b) => { const d = dayOf(b); return d != null && d < todayStart() && OPEN.has(statusOf(b)); },
  nodate:   (b) => dayOf(b) == null,
};
const DATE_LABELS = { any: 'Any date', today: 'Today', tomorrow: 'Tomorrow', week: 'Next 7 days', overdue: 'Overdue', nodate: 'No date' };

const haystack = (b) => [
  b.orderId, b.customerName, b.customerPhone, b.customerAltPhone, b.customerEmail,
  b.serviceName, b.servicePath, b.address, b.notes, b.adminNote, b.venueType,
].join(' ').toLowerCase();
function matchesQuery(b) {
  const tokens = view.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const h = haystack(b);
  return tokens.every((t) => h.includes(t));
}

function filtered() {
  const list = orders.filter((b) => STATUS_FILTERS[view.status](b) && DATE_FILTERS[view.date](b) && matchesQuery(b));
  if (view.sort === 'date') {
    list.sort((a, b) => ((dayOf(a) ?? Infinity) - (dayOf(b) ?? Infinity)) || (millis(b.createdAt) - millis(a.createdAt)));
  }
  return list;
}

let qTimer = null;
$('q').addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { view.q = $('q').value.trim(); render(); }, 120);
});
$('sortSel').addEventListener('change', () => { view.sort = $('sortSel').value; render(); });
$('statusChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-status]');
  if (c) { view.status = c.dataset.status; render(); }
});
$('dateChips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-date]');
  if (c) { view.date = c.dataset.date; render(); }
});
$('stats').addEventListener('click', (e) => {
  const s = e.target.closest('[data-go-status]');
  if (!s) return;
  view.status = s.dataset.goStatus;
  view.date = s.dataset.goDate;
  render();
  $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─── Render ───────────────────────────────────────────────────────────────────
function paintStats() {
  const t0 = todayStart();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const newCount = orders.filter((b) => statusOf(b) === 'pending').length;
  const today = orders.filter((b) => dayOf(b) === t0 && statusOf(b) !== 'cancelled').length;
  const week = orders.filter((b) => { const d = dayOf(b); return d != null && d >= t0 && d < t0 + 7 * DAY && OPEN.has(statusOf(b)); }).length;
  const done = orders.filter((b) => statusOf(b) === 'completed' && millis(b.completedAt || b.createdAt) >= monthStart.getTime());
  const revenue = done.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const stat = (label, value, sub, cls, status, date) => `
    <button type="button" class="st-card ${cls}" data-go-status="${status}" data-go-date="${date}">
      <small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(sub)}</span>
    </button>`;
  $('stats').innerHTML = [
    stat('New orders', newCount, 'Waiting to be confirmed', newCount ? 'is-hot' : '', 'pending', 'any'),
    stat("Today's jobs", today, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }), '', 'all', 'today'),
    stat('Next 7 days', week, 'Active jobs scheduled', '', 'open', 'week'),
    stat('Earned this month', `₹${inr(revenue)}`, `${done.length} completed`, 'is-money', 'completed', 'any'),
  ].join('');
}

function paintChips() {
  const byDate = orders.filter((b) => DATE_FILTERS[view.date](b) && matchesQuery(b));
  $('statusChips').innerHTML = Object.keys(STATUS_FILTERS).map((k) => {
    const n = byDate.filter(STATUS_FILTERS[k]).length;
    return `<button type="button" class="chip${view.status === k ? ' on' : ''}${k === 'pending' && n ? ' hot' : ''}" data-status="${k}" aria-pressed="${view.status === k}">${STATUS_LABELS[k]} <b>${n}</b></button>`;
  }).join('');
  const byStatus = orders.filter((b) => STATUS_FILTERS[view.status](b) && matchesQuery(b));
  $('dateChips').innerHTML = Object.keys(DATE_FILTERS).map((k) => {
    const n = byStatus.filter(DATE_FILTERS[k]).length;
    return `<button type="button" class="chip${view.date === k ? ' on' : ''}${k === 'overdue' && n ? ' warn' : ''}" data-date="${k}" aria-pressed="${view.date === k}">${DATE_LABELS[k]} <b>${n}</b></button>`;
  }).join('');
}

function card(b) {
  const st = statusOf(b);
  const S = STATUS[st];
  const phone = digits(b.customerPhone);
  const alt = digits(b.customerAltPhone);
  const d = parseDay(b.scheduledDate);
  const dk = dayOf(b);
  const t0 = todayStart();
  const dayCls = dk === t0 ? 'is-today' : dk === t0 + DAY ? 'is-tomorrow' : (dk != null && dk < t0 && OPEN.has(st) ? 'is-overdue' : '');
  const maps = mapsUrl(b);
  const qty = Number(b.quantity) || 1;
  const amount = Number(b.amount) > 0 ? `₹${inr(b.amount)}` : (b.channel === 'callback' ? 'Call-back request' : 'Price after visit');
  const mrp = Number(b.mrp) > 0 && Number(b.amount) > 0 && Number(b.mrp) * qty > Number(b.amount)
    ? `<s>₹${inr(Number(b.mrp) * qty)}</s>` : '';
  const prev = PREV[st];
  const more = openMore.has(b.id);
  return `
  <article class="oc st-${st}${fresh.has(b.id) ? ' is-new' : ''}" data-id="${esc(b.id)}">
    <header class="oc-head">
      <span class="oc-badge b-${st}">${S.label}</span>
      ${b.orderId ? `<button type="button" class="oc-id" data-copy="${esc(b.orderId)}" title="Copy order ID">${esc(b.orderId)}</button>` : ''}
      <span class="oc-when">${esc(ago(b.createdAt))} · ${esc(channelLabel(b))}${b.isGuest ? ' · guest' : ''}</span>
    </header>
    <div class="oc-svc">
      <strong>${esc(b.serviceName || 'Service')}</strong>
      ${b.servicePath && b.servicePath !== b.serviceName ? `<small>${esc(b.servicePath)}</small>` : ''}
    </div>
    <div class="oc-price"><span>${esc(amount)}</span>${mrp}${qty > 1 ? `<em>qty ${qty}</em>` : ''}</div>
    <dl class="oc-info">
      <div><dt>Customer</dt><dd>${esc(b.customerName || '—')}</dd></div>
      <div><dt>Mobile</dt><dd>${phone ? `<a href="tel:+91${phone}">+91 ${fmt10(phone)}</a>` : '—'}${alt ? `<br /><a href="tel:+91${alt}">+91 ${fmt10(alt)}</a> <small>alt</small>` : ''}</dd></div>
      <div><dt>Service date</dt><dd class="${dayCls}">${d ? esc(dayLabel(d)) : 'Not set'}${b.timeSlot ? ` · ${esc(b.timeSlot)}` : ''}</dd></div>
      ${b.customerEmail ? `<div><dt>Email</dt><dd>${EMAIL_OK.test(b.customerEmail)
        ? `<a href="mailto:${esc(b.customerEmail)}">${esc(b.customerEmail)}</a>`
        : esc(b.customerEmail)}</dd></div>` : ''}
      ${b.address ? `<div class="wide"><dt>Address${b.geo ? ' <span class="gps">GPS pinned</span>' : ''}</dt><dd>${esc(String(b.address).replace(/\n+/g, ', '))}</dd></div>` : ''}
      ${b.venueType ? `<div><dt>Venue</dt><dd>${esc(b.venueType)}</dd></div>` : ''}
      ${b.notes ? `<div class="wide"><dt>Customer notes</dt><dd>${esc(b.notes)}</dd></div>` : ''}
      ${b.adminNote ? `<div class="wide note"><dt>Staff note</dt><dd>${esc(b.adminNote)}</dd></div>` : ''}
    </dl>
    <div class="oc-actions">
      ${phone ? `<a class="oa" href="tel:+91${phone}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Call</span></a>
      <a class="oa oa-wa" href="${waUrl(b, phone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>` : ''}
      ${maps ? `<a class="oa" href="${esc(maps)}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>Navigate</span></a>` : ''}
      ${S.next ? `<button type="button" class="oa oa-next" data-act="next" data-to="${S.next}"><i class="fa-solid ${S.icon}" aria-hidden="true"></i><span>${S.nextLabel}</span></button>` : ''}
      <button type="button" class="oa oa-more" data-act="more" aria-expanded="${more}" aria-label="More actions"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
    </div>
    <div class="oc-more"${more ? '' : ' hidden'}>
      <button type="button" data-act="note"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${b.adminNote ? 'Edit' : 'Add'} staff note</button>
      ${prev ? `<button type="button" data-act="revert" data-to="${prev}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${st === 'cancelled' ? 'Reopen as New' : `Move back to ${STATUS[prev].label}`}</button>` : ''}
      ${OPEN.has(st) ? '<button type="button" class="danger" data-act="cancel"><i class="fa-solid fa-ban" aria-hidden="true"></i> Cancel order</button>' : ''}
    </div>
  </article>`;
}

function render() {
  // New-order highlight lasts two minutes
  const cutoff = Date.now() - 120000;
  for (const [id, t] of fresh) if (t < cutoff) fresh.delete(id);

  paintStats();
  paintChips();
  const list = filtered();
  const filteredOut = view.status !== 'all' || view.date !== 'any' || view.q;
  $('resultInfo').textContent = `${list.length} order${list.length === 1 ? '' : 's'}${view.q ? ` matching “${view.q}”` : ''}`;
  $('list').innerHTML = list.length ? list.map(card).join('') : (orders.length && filteredOut
    ? `<div class="adm-empty"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i>
         <p>No orders match these filters.</p>
         <button type="button" class="a-btn a-ghost" id="clearFilters">Show all orders</button></div>`
    : `<div class="adm-empty"><i class="fa-regular fa-bell" aria-hidden="true"></i>
         <p>No orders yet. New bookings appear here the moment they're placed.</p></div>`);
  $('clearFilters')?.addEventListener('click', () => {
    Object.assign(view, { status: 'all', date: 'any', q: '' });
    $('q').value = '';
    render();
  });
}
// Keep the "5 min ago" labels honest without a full reload
setInterval(() => { if (me && !document.hidden) render(); }, 60000);

// ─── Card actions ─────────────────────────────────────────────────────────────
async function setStatus(b, status, btn) {
  if (btn) btn.disabled = true;
  try {
    await updateDoc(doc(db, 'bookings', b.id), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: me?.uid || null,
      [`${status}At`]: serverTimestamp(),
    });
    toast(`${b.orderId || 'Order'} → ${STATUS[status].label}`);
  } catch (err) {
    console.error('[admin] status update failed', err);
    if (btn) btn.disabled = false;
    alert(err?.code === 'permission-denied'
      ? "You don't have permission to change this order."
      : 'Could not update the order. Check your connection and try again.');
  }
}

async function saveNote(b, text) {
  try {
    await updateDoc(doc(db, 'bookings', b.id), { adminNote: text, updatedAt: serverTimestamp(), updatedBy: me?.uid || null });
    toast(text ? 'Staff note saved' : 'Staff note removed');
  } catch (err) {
    console.error('[admin] note failed', err);
    alert('Could not save the note. Please try again.');
  }
}

$('list').addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Order ID copied'); }
    catch { toast(copy.dataset.copy); }
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const cardEl = btn.closest('.oc');
  const b = orders.find((o) => o.id === cardEl?.dataset.id);
  if (!b) return;
  const act = btn.dataset.act;

  if (act === 'more') {
    const panel = cardEl.querySelector('.oc-more');
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) openMore.delete(b.id); else openMore.add(b.id);
    return;
  }
  if (act === 'next') { setStatus(b, btn.dataset.to, btn); return; }
  if (act === 'revert') {
    if (confirm(`Move ${b.orderId || 'this order'} back to "${STATUS[btn.dataset.to].label}"?`)) setStatus(b, btn.dataset.to, btn);
    return;
  }
  if (act === 'cancel') {
    if (confirm(`Cancel ${b.orderId || 'this order'} for ${b.customerName || 'this customer'}?\n\nThe customer will see it as cancelled.`)) {
      openMore.delete(b.id);
      setStatus(b, 'cancelled', btn);
    }
    return;
  }
  if (act === 'note') {
    const v = prompt('Staff note for this order (shown on this dashboard):', b.adminNote || '');
    if (v !== null) saveNote(b, v.trim().slice(0, 500));
  }
});

// ─── CSV export (what's on screen, with the current filters) ─────────────────
$('exportBtn').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) { toast('Nothing to export for these filters'); return; }
  const cols = [
    ['Order ID', (b) => b.orderId],
    ['Placed', (b) => fmtDateTime(b.createdAt)],
    ['Status', (b) => STATUS[statusOf(b)].label],
    ['Channel', channelLabel],
    ['Service', (b) => b.serviceName],
    ['Details', (b) => b.servicePath],
    ['Amount (INR)', (b) => Number(b.amount) || 0],
    ['Qty', (b) => Number(b.quantity) || 1],
    ['Customer', (b) => b.customerName],
    ['Mobile', (b) => digits(b.customerPhone)],
    ['Alt mobile', (b) => digits(b.customerAltPhone)],
    ['Email', (b) => b.customerEmail],
    ['Service date', (b) => { const d = parseDay(b.scheduledDate); return d ? d.toLocaleDateString('en-IN') : ''; }],
    ['Address', (b) => String(b.address || '').replace(/\n+/g, ', ')],
    ['Maps', mapsUrl],
    ['Customer notes', (b) => b.notes],
    ['Staff note', (b) => b.adminNote],
  ];
  // A leading = + - @ would make Excel run the cell as a formula
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => c[0]), ...rows.map((b) => cols.map((c) => c[1](b)))];
  const csv = '\uFEFF' + lines.map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `myneedurban-orders-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Exported ${rows.length} order${rows.length === 1 ? '' : 's'}`);
});
