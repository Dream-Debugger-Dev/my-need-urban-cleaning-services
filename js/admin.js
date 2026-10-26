/* ===============================
   MyNeedUrban — admin.js
   The team's app: Overview, Orders, Schedule, People and Settings.

   - They sign in with their phone number (OTP). Access needs
     users/{uid}.role == 'admin' or 'staff', a phone sign-in, AND that phone
     number to equal users/{uid}.adminPhone: the same checks the Firestore
     security rules enforce. The rules are the real lock; this page only
     explains what's needed. A password can never open this page's data.
   - Wrong codes and repeated OTP requests are slowed down (auth-guard.js),
     on top of Firebase's own limits.
   - Everything is one live stream of the newest 300 orders ("Load older" adds
     more); each page is a different view of it. The page address remembers
     the page, the filters and the open order, so links and the Back button work:
       #/orders?status=pending&date=overdue     #/schedule?d=2026-10-21
   - Admins also get People (customers + team) and the booking-email settings.
     Team members are added, edited (name, number, role) or removed through the
     addStaff / updateTeamMember / removeStaff Cloud Functions; the alert
     emails are settings/notifications.
   - Orders open in a details panel: status steps, call / WhatsApp / navigate,
     change the date, assign a team member, staff note and history.
   - New-order alerts: chime, vibration, a system notification shown through
     the service worker (Android Chrome can't use `new Notification()`),
     and a count in the tab title.
   =============================== */
import {
  auth, db, VAPID_KEY, callFunction,
  onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber, signOut,
  collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from './firebase-config.js?v=20261026a';
import { waitFor, failed, succeeded, smsWait, smsSent, inWords, countdown } from './auth-guard.js?v=20261026a';

// Refuse to run inside another website's frame (clickjacking: a hidden
// frame tricking staff into tapping "Cancel order"). Same-site frames are fine.
if (window.top !== window.self) {
  let sameSite = false;
  try { sameSite = window.top.location.origin === location.origin; } catch (_) { /* other site */ }
  if (!sameSite) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(location.href); } catch (_) { /* sandboxed frame */ }
    throw new Error('The admin app cannot be shown inside another website.');
  }
}

const PAGE_SIZE = 300;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => Number(n || 0).toLocaleString('en-IN');
const DAY = 86400000;
const TITLE = 'MNU Admin';

// ─── Status model ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:    { label: 'New',         next: 'confirmed',  nextLabel: 'Confirm',       nextShort: 'Confirm',  icon: 'fa-circle-check' },
  confirmed:  { label: 'Confirmed',   next: 'inProgress', nextLabel: 'Start job',     nextShort: 'Start',    icon: 'fa-broom' },
  inProgress: { label: 'In progress', next: 'completed',  nextLabel: 'Mark complete', nextShort: 'Complete', icon: 'fa-flag-checkered' },
  completed:  { label: 'Completed' },
  cancelled:  { label: 'Cancelled' },
};
const FLOW = ['pending', 'confirmed', 'inProgress', 'completed'];
const PREV = { confirmed: 'pending', inProgress: 'confirmed', completed: 'inProgress', cancelled: 'pending' };
const OPEN = new Set(['pending', 'confirmed', 'inProgress']);
const statusOf = (b) => (STATUS[b.status] ? b.status : 'pending');
const isOpen = (b) => OPEN.has(statusOf(b));
const CHANNEL = { website: 'Website', whatsapp: 'WhatsApp', call: 'Phone call', callback: 'Call-back', app: 'App', unknown: 'Website' };
const channelKey = (b) => (b.channel && CHANNEL[b.channel] ? b.channel : (b.channel ? String(b.channel) : (b.source === 'app' ? 'app' : 'website')));
const channelLabel = (b) => CHANNEL[channelKey(b)] || channelKey(b);

// ─── State ────────────────────────────────────────────────────────────────────
let me = null;
let myRole = '';              // 'admin' or 'staff'
let myName = '';
let pageSize = PAGE_SIZE;
let unsub = null;
let orders = [];              // newest first (query order)
let ordersLoaded = false;     // the first answer from the database has arrived
let firstSnap = true;
let lastSize = 0;
const seen = new Set();
const fresh = new Map();      // id → time it arrived while the page was open
let unread = 0;

// ─── Time helpers ─────────────────────────────────────────────────────────────
const millis = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
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
  $('alertsBtn').hidden = true;
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
        For your customers' safety, the admin app only opens after a phone sign-in. A password can't open it.</p>
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
      btn.textContent = 'Verify and sign in';
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
      btn.textContent = 'Verify and sign in';
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

/**
 * Signed in, but this account can't open Live Orders yet: show exactly how
 * to grant it. Access needs role "admin" AND adminPhone = this session's
 * verified number (the database rules check both).
 */
async function gateDenied(user, hasProfile, numberOnly = false) {
  // A first phone sign-in has no profile yet. Create the normal customer
  // profile (the rules allow exactly this), so granting access later is a
  // two-field change in the console.
  if (!hasProfile) {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || '', phone: user.phoneNumber || '', role: 'customer', createdAt: serverTimestamp(),
      });
    } catch (e) { console.warn('[admin] could not create profile', e?.code || e); }
    if (auth.currentUser?.uid !== user.uid) return;
  }
  const phone = user.phoneNumber || '';
  showGate(`
    <div class="g-card">
      <div class="g-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></div>
      <h1>${numberOnly ? 'Number not registered' : 'No team access'}</h1>
      <p><strong>${esc(phone || user.email || 'This account')}</strong> ${numberOnly
        ? "isn't the phone number registered for this team account."
        : "isn't set up for the admin app."}</p>
      ${numberOnly ? '' : `<p class="g-small">Staff: ask an admin to add your number under <strong>People → Team</strong>, then sign in again.</p>`}
      <p class="g-small">Setting up the very first admin by hand:</p>
      <ol class="g-steps">
        <li>The owner opens <strong>Firebase console → Firestore Database → users</strong>.</li>
        <li>Opens the document named <code>${esc(user.uid)}</code>.</li>
        <li>Sets <code>role</code> to <code>admin</code> and adds a text field <code>adminPhone</code>
          with the value <code>${esc(phone || '+91XXXXXXXXXX')}</code>. Then sign in again here.</li>
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
      <p>For your customers' safety, the admin app only opens after signing in with your phone number (OTP).
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
  let adminPhone = '';
  let hasProfile = false;
  let provider = '';
  let profileName = '';
  try {
    const [snap, token] = await Promise.all([getDoc(doc(db, 'users', user.uid)), user.getIdTokenResult()]);
    hasProfile = snap.exists();
    role = hasProfile ? snap.data().role : null;
    adminPhone = hasProfile ? String(snap.data().adminPhone || '') : '';
    profileName = hasProfile ? String(snap.data().name || '').trim() : '';
    provider = token?.signInProvider || '';
  } catch (err) {
    console.error('[admin] role check failed', err);
    if (auth.currentUser?.uid === user.uid) gateError(err, () => checkAccess(user));
    return;
  }
  if (auth.currentUser?.uid !== user.uid) return;
  if (role !== 'admin' && role !== 'staff') { setLive('off', 'No access'); gateDenied(user, hasProfile); return; }
  if (provider !== 'phone') { setLive('off', 'Phone sign-in needed'); gatePhoneOnly(); return; }
  // Same check as the database rules: the session's verified number must be
  // the one registered for this admin (stops an intruder who linked their own phone).
  if (!adminPhone || adminPhone !== user.phoneNumber) {
    setLive('off', 'Number not registered'); gateDenied(user, true, true); return;
  }

  startApp(user, role, profileName);               // admins also get People and the email settings
}

onAuthStateChanged(auth, (user) => {
  // Wipe the previous session's customer data from the page: a shared phone
  // must not keep names, numbers and addresses around after sign-out.
  resetApp();
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
    ordersLoaded = true;
    lastSize = snap.size;
    $('moreWrap').hidden = lastSize < pageSize;
    if (arrived.length) announce(arrived);
    render();
  }, (err) => {
    console.error('[admin] orders stream failed', err);
    if (!me) return;                                 // the page was already reset (signed out, or their role changed)
    setLive('off', err?.code === 'permission-denied' ? 'No permission' : 'Disconnected');
    ordersLoaded = true;
    render();
    const msg = err?.code === 'permission-denied'
      ? "The database refused this account. Check that its role is 'admin' or 'staff' and that the security rules are deployed."
      : "Can't reach the database right now.";
    $('list').innerHTML = `
      <div class="adm-empty warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <p>${msg}</p>
        <button class="btn-main" type="button" id="streamRetry">Try again</button></div>`;
    $('streamRetry')?.addEventListener('click', listen);
    toast(msg);
  });
}

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
  const sw = $('alertsSwitch');                       // the same setting, on the Settings page
  sw.setAttribute('aria-checked', String(alertsOn));
  sw.classList.toggle('on', alertsOn);
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
  document.title = `${VIEWS[route.name] || 'Overview'} — ${TITLE}`;
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
  const row = b.closest('.set-row');
  if (!('wakeLock' in navigator)) { if (row) row.hidden = true; return; }   // not every browser can do this
  if (row) row.hidden = false;
  b.setAttribute('aria-checked', String(wantAwake));
  b.classList.toggle('on', wantAwake);
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

// ═════════════════════════════════════════════════════════════════════════════
//  THE APP: pages, filters, order details
// ═════════════════════════════════════════════════════════════════════════════
const VIEWS = { overview: 'Overview', orders: 'Orders', schedule: 'Schedule', people: 'People', settings: 'Settings' };
let route = { name: 'overview', params: new URLSearchParams() };
let viewDrawn = false;
let drawerId = '';
let drawerPushed = false;
let lastFocus = null;
const drawerEdits = new Set();        // ids of the note/date boxes with words typed but not saved
let teamRows = [];                    // admins + staff (admins only can read this)
let teamLoaded = false;
let teamUnsub = null;

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayStr = (b) => { const d = parseDay(b.scheduledDate); return d ? ymd(d) : ''; };
const initials = (s) => {
  const w = String(s || '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '·';
};
const catOf = (b) => String(b.servicePath || b.serviceName || 'Other').split(/\s*[>›]\s*/)[0].trim() || 'Other';
function areaOf(b) {
  const p = b.addressParts || {};
  const parts = [p.street || p.building, p.city].filter(Boolean);
  return parts.length ? parts.join(', ') : String(b.address || '').replace(/\s*\n+\s*/g, ', ').trim();
}
const orderById = (id) => orders.find((o) => o.id === id);

/** "Today" / "Tomorrow" / "Thu, 22 Oct" with a quieter second line, plus a colour class. */
function whenParts(b) {
  const d = parseDay(b.scheduledDate);
  if (!d) return { main: 'No date', sub: b.timeSlot || 'Not set', cls: 'is-none' };
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - todayStart()) / DAY);
  const short = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const slot = b.timeSlot ? ` · ${b.timeSlot}` : '';
  if (diff === 0) return { main: 'Today', sub: short + slot, cls: 'is-today' };
  if (diff === 1) return { main: 'Tomorrow', sub: short + slot, cls: 'is-tomorrow' };
  if (diff < 0) return { main: diff === -1 ? 'Yesterday' : `${-diff} days ago`, sub: short + slot, cls: isOpen(b) ? 'is-overdue' : '' };
  return { main: short, sub: (diff < 7 ? `In ${diff} days` : '') + slot, cls: '' };
}

async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (_) { toast(text); }
}

// ─── Page address (router) ───────────────────────────────────────────────────
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  let name = VIEWS[path] ? path : 'overview';
  if (name === 'people' && myRole !== 'admin') name = 'overview';
  return { name, params: new URLSearchParams(qs) };
}
const hashFor = (name, params) => `#/${name}${params.toString() ? `?${params}` : ''}`;
const baseKey = (r) => `${r.name}?${[...r.params].filter(([k]) => k !== 'o').map(([k, v]) => `${k}=${v}`).sort().join('&')}`;

/** Change the filters in the address without adding Back-button steps. */
function setParams(patch) {
  const p = new URLSearchParams(route.params);
  for (const [k, v] of Object.entries(patch)) { if (v === '' || v == null) p.delete(k); else p.set(k, String(v)); }
  history.replaceState(null, '', hashFor(route.name, p));
  route = { name: route.name, params: p };
  renderCurrent();
}

function handleRoute() {
  if (!me) return;
  const prev = route;
  route = parseRoute();
  showView(route.name);
  if (!viewDrawn || baseKey(prev) !== baseKey(route)) {
    window.scrollTo(0, 0);
    renderCurrent();
  }
  syncDrawer(route.params.get('o') || '');
}
window.addEventListener('hashchange', handleRoute);

function showView(name) {
  document.body.dataset.view = name;                 // lets the style sheet hide the top search where the page has its own
  Object.keys(VIEWS).forEach((v) => { $(`v-${v}`).hidden = v !== name; });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === name;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = VIEWS[name];
  if (!unread) document.title = `${VIEWS[name]} — ${TITLE}`;
}

function paintChrome() {
  const pending = orders.filter((b) => statusOf(b) === 'pending').length;
  document.querySelectorAll('[data-badge-new]').forEach((el) => { el.hidden = !pending; el.textContent = pending > 99 ? '99+' : pending; });
  const who = myName || (myRole === 'admin' ? 'Admin' : 'Staff');
  $('whoName').textContent = who;
  $('whoAv').textContent = initials(who);
  $('whoami').textContent = `${myRole === 'admin' ? 'Admin' : 'Staff'} · ${me?.phoneNumber || me?.email || ''}`;
  document.documentElement.dataset.role = myRole;
}

function renderCurrent() {
  if (!me) return;
  paintChrome();
  ({ overview: renderOverview, orders: renderOrders, schedule: renderSchedule, people: renderPeople, settings: renderSettings })[route.name]();
  viewDrawn = true;
}

/** The data changed (or a minute passed): redraw the current page and the open order. */
function render() {
  if (!me) return;
  renderCurrent();
  refreshDrawer();
}

// ─── Order rows (used by Orders and Schedule) ────────────────────────────────
function ordRow(b) {
  const st = statusOf(b), S = STATUS[st];
  const phone = digits(b.customerPhone);
  const w = whenParts(b);
  const qty = Number(b.quantity) || 1;
  const amount = Number(b.amount) > 0 ? `₹${inr(b.amount)}` : (b.channel === 'callback' ? 'Call-back' : 'Quote');
  const path = b.servicePath && b.servicePath !== b.serviceName ? b.servicePath : '';
  return `
  <article class="ord st-${st}${fresh.has(b.id) ? ' is-new' : ''}" data-id="${esc(b.id)}" tabindex="0">
    <div class="c-id">
      <span class="badge b-${st}">${S.label}</span>
      ${b.orderId ? `<button type="button" class="oid" data-copy="${esc(b.orderId)}" title="Copy order ID">${esc(b.orderId)}</button>` : ''}
      <small>${esc(ago(b.createdAt))} · ${esc(channelLabel(b))}${b.isGuest ? ' · guest' : ''}</small>
      ${b.assignedName ? `<span class="asg"><i class="fa-solid fa-user-check" aria-hidden="true"></i>${esc(b.assignedName)}</span>` : ''}
    </div>
    <div class="c-cust"><strong>${esc(b.customerName || 'Customer')}</strong><small>${esc(areaOf(b) || '—')}</small></div>
    <div class="c-svc"><strong>${esc(b.serviceName || 'Service')}</strong>${path ? `<small>${esc(path)}</small>` : ''}</div>
    <div class="c-date ${w.cls}"><strong>${esc(w.main)}</strong><small>${esc(w.sub)}</small></div>
    <div class="c-amt"><strong>${esc(amount)}</strong>${qty > 1 ? `<small>qty ${qty}</small>` : ''}</div>
    <div class="c-act">
      ${phone ? `<a class="ia" href="tel:+91${phone}" aria-label="Call ${esc(b.customerName || 'customer')}"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>
      <a class="ia ia-wa" href="${waUrl(b, phone)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(b.customerName || 'customer')}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>` : ''}
      ${S.next ? `<button type="button" class="go go-${st}" data-act="next" data-to="${S.next}"><i class="fa-solid ${S.icon}" aria-hidden="true"></i><span class="lb-long">${S.nextLabel}</span><span class="lb-short">${S.nextShort}</span></button>` : ''}
    </div>
  </article>`;
}

function miniRow(b) {
  const st = statusOf(b), S = STATUS[st], w = whenParts(b);
  return `
  <div class="mini" data-id="${esc(b.id)}" tabindex="0">
    <span class="dot-st b-${st}" aria-hidden="true"></span>
    <span class="mini-t"><strong>${esc(b.customerName || 'Customer')} · ${esc(b.serviceName || 'Service')}</strong>
      <small class="${w.cls}">${esc([w.main, w.sub].filter(Boolean).join(' · '))}${b.orderId ? ` · ${esc(b.orderId)}` : ''}</small></span>
    ${S.next ? `<button type="button" class="go go-${st}" data-act="next" data-to="${S.next}"><i class="fa-solid ${S.icon}" aria-hidden="true"></i><span>${S.nextShort}</span></button>`
             : `<span class="badge b-${st}">${S.label}</span>`}
  </div>`;
}

/** One click handler for every list of orders: copy, move along, or open the details. */
function bindOrderList(el) {
  el.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy, 'Order ID copied'); return; }
    const act = e.target.closest('[data-act="next"]');
    const row = e.target.closest('[data-id]');
    if (act && row) { const b = orderById(row.dataset.id); if (b) setStatus(b, act.dataset.to, act); return; }
    if (e.target.closest('a')) return;                       // Call / WhatsApp links work as links
    if (row) openOrder(row.dataset.id);
  });
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ord, .mini, .cust')) {
      e.preventDefault();
      if (e.target.dataset.id) openOrder(e.target.dataset.id);
    }
  });
}

// ─── Overview ────────────────────────────────────────────────────────────────
function renderOverview() {
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  $('helloTitle').textContent = `${hello}${myName ? `, ${myName.split(/\s+/)[0]}` : ''}`;
  $('helloSub').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const t0 = todayStart();
  const pending = orders.filter((b) => statusOf(b) === 'pending');
  const today = orders.filter((b) => dayOf(b) === t0 && statusOf(b) !== 'cancelled');
  const overdue = orders.filter((b) => isOpen(b) && dayOf(b) != null && dayOf(b) < t0);
  const week = orders.filter((b) => isOpen(b) && dayOf(b) != null && dayOf(b) >= t0 && dayOf(b) < t0 + 7 * DAY);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const done = orders.filter((b) => statusOf(b) === 'completed' && millis(b.completedAt || b.createdAt) >= monthStart.getTime());
  const earned = done.reduce((s, b) => s + (Number(b.amount) || 0), 0);

  const cta = $('helloCta');
  cta.href = pending.length ? '#/orders?status=pending' : '#/orders';
  cta.querySelector('span').textContent = pending.length ? `Review ${pending.length} new order${pending.length === 1 ? '' : 's'}` : 'Open orders';

  const kpi = (cls, icon, label, value, sub, href) => `
    <a class="kpi ${cls}" href="${href}">
      <span class="kpi-top"><small>${esc(label)}</small><span class="kpi-ic"><i class="fa-solid ${icon}" aria-hidden="true"></i></span></span>
      <strong>${esc(value)}</strong>
      <em>${esc(sub)}</em>
    </a>`;
  $('kpis').innerHTML = [
    kpi(pending.length ? 'hot' : '', 'fa-bell', 'New orders', pending.length, 'Need confirming', '#/orders?status=pending'),
    kpi('', 'fa-calendar-day', "Today's jobs", today.length, new Date().toLocaleDateString('en-IN', { weekday: 'long' }), '#/schedule'),
    kpi(overdue.length ? 'warn' : '', 'fa-triangle-exclamation', 'Overdue', overdue.length, 'Date has passed', '#/orders?date=overdue'),
    kpi('', 'fa-calendar-week', 'Next 7 days', week.length, 'Active jobs', '#/orders?date=week'),
    kpi('money', 'fa-indian-rupee-sign', 'Earned', `₹${inr(earned)}`, `This month · ${done.length} done`, '#/orders?status=completed'),
  ].join('');

  const empty = (icon, text) => `<div class="mini-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><p>${esc(text)}</p></div>`;
  const loading = !ordersLoaded;
  $('ovAction').innerHTML = loading ? skeleton(3, 'mini-sk')
    : pending.length ? pending.slice(0, 6).map(miniRow).join('') + (pending.length > 6 ? `<a class="more-link" href="#/orders?status=pending">+ ${pending.length - 6} more new orders</a>` : '')
    : empty('fa-circle-check', 'All caught up. No new orders waiting.');

  const soon = orders.filter((b) => isOpen(b) && (dayOf(b) === t0 || dayOf(b) === t0 + DAY))
    .sort((a, b) => (dayOf(a) - dayOf(b)) || (millis(a.createdAt) - millis(b.createdAt)));
  $('ovToday').innerHTML = loading ? skeleton(3, 'mini-sk')
    : soon.length ? soon.slice(0, 8).map(miniRow).join('') + (soon.length > 8 ? `<a class="more-link" href="#/schedule">+ ${soon.length - 8} more</a>` : '')
    : empty('fa-mug-hot', 'Nothing scheduled for today or tomorrow.');

  $('ovOverdueCard').hidden = !overdue.length;
  $('ovOverdue').innerHTML = overdue.slice(0, 5).map(miniRow).join('') + (overdue.length > 5 ? `<a class="more-link" href="#/orders?date=overdue">+ ${overdue.length - 5} more overdue</a>` : '');

  // New bookings per day, last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ d, n: 0 }); }
  for (const b of orders) {
    const t = millis(b.createdAt);
    const slot = days.find((x) => t >= x.d.getTime() && t < x.d.getTime() + DAY);
    if (slot) slot.n += 1;
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  const total = days.reduce((s, x) => s + x.n, 0);
  $('ovChart').setAttribute('aria-label', `${total} new bookings in the last 14 days`);
  $('ovChart').innerHTML = days.map((x, i) => `
    <div class="bar${i === 13 ? ' is-today' : ''}" title="${esc(x.d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }))}: ${x.n} booking${x.n === 1 ? '' : 's'}">
      <span class="bar-n">${x.n || ''}</span><i style="height:${Math.max(x.n ? 8 : 3, Math.round((x.n / max) * 100))}%"></i><small>${x.d.getDate()}</small>
    </div>`).join('');

  // Top services, last 30 days
  const since = Date.now() - 30 * DAY;
  const by = new Map();
  for (const b of orders) {
    if (statusOf(b) === 'cancelled' || millis(b.createdAt) < since) continue;
    const k = catOf(b);
    const r = by.get(k) || { n: 0, value: 0 };
    r.n += 1; r.value += Number(b.amount) || 0;
    by.set(k, r);
  }
  const top = [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  const topMax = Math.max(1, ...top.map(([, r]) => r.n));
  $('ovServices').innerHTML = top.length ? top.map(([k, r]) => `
    <a class="hbar" href="#/orders?status=all&svc=${encodeURIComponent(k)}">
      <span class="hbar-t"><strong>${esc(k)}</strong><small>${r.n} booking${r.n === 1 ? '' : 's'}${r.value ? ` · ₹${inr(r.value)}` : ''}</small></span>
      <span class="hbar-b"><i style="width:${Math.round((r.n / topMax) * 100)}%"></i></span>
    </a>`).join('') : empty('fa-chart-simple', 'Services will rank here once bookings come in.');
}

const skeleton = (n, cls) => Array.from({ length: n }, () => `<div class="${cls}" aria-hidden="true"></div>`).join('');

// ─── Orders ──────────────────────────────────────────────────────────────────
const STATUS_TABS = [['open', 'Active'], ['pending', 'New'], ['confirmed', 'Confirmed'], ['inProgress', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']];
const STATUS_FILTERS = {
  open: isOpen,
  pending: (b) => statusOf(b) === 'pending',
  confirmed: (b) => statusOf(b) === 'confirmed',
  inProgress: (b) => statusOf(b) === 'inProgress',
  completed: (b) => statusOf(b) === 'completed',
  cancelled: (b) => statusOf(b) === 'cancelled',
  all: () => true,
};
const DATE_LABELS = { any: 'Any date', today: 'Today', tomorrow: 'Tomorrow', week: 'Next 7 days', overdue: 'Overdue', nodate: 'No date set', range: 'Date range' };

function filtersFromRoute() {
  const p = route.params;
  return {
    status: STATUS_FILTERS[p.get('status')] ? p.get('status') : 'open',
    date: DATE_LABELS[p.get('date')] ? p.get('date') : 'any',
    from: /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? p.get('from') : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? p.get('to') : '',
    svc: p.get('svc') || '', ch: p.get('ch') || '', asg: p.get('asg') || '', q: p.get('q') || '',
    sort: ['old', 'date', 'amount'].includes(p.get('sort')) ? p.get('sort') : 'new',
  };
}

function dateMatch(b, f) {
  const d = dayOf(b), t0 = todayStart();
  switch (f.date) {
    case 'today': return d === t0;
    case 'tomorrow': return d === t0 + DAY;
    case 'week': return d != null && d >= t0 && d < t0 + 7 * DAY;
    case 'overdue': return d != null && d < t0 && isOpen(b);
    case 'nodate': return d == null;
    case 'range': {
      if (d == null) return false;
      const from = f.from ? parseDay(f.from).getTime() : -Infinity;
      const to = f.to ? parseDay(f.to).getTime() : Infinity;
      return d >= from && d <= to;
    }
    default: return true;
  }
}
const asgMatch = (b, v) => (!v ? true : v === 'none' ? !b.assignedTo : v === 'me' ? b.assignedTo === me?.uid : b.assignedTo === v);
const haystack = (b) => [
  b.orderId, b.customerName, b.customerPhone, b.customerAltPhone, b.customerEmail,
  b.serviceName, b.servicePath, b.address, b.notes, b.adminNote, b.venueType, b.assignedName,
].join(' ').toLowerCase();
function textMatch(b, q) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const h = haystack(b);
  return tokens.every((t) => h.includes(t));
}
/** Everything except the status tab, so each tab can show how many orders it would hold. */
const matchOthers = (b, f) => dateMatch(b, f) && (!f.svc || catOf(b) === f.svc) && (!f.ch || channelKey(b) === f.ch)
  && asgMatch(b, f.asg) && textMatch(b, f.q);

function sortList(list, sort) {
  const a = [...list];
  if (sort === 'old') a.sort((x, y) => millis(x.createdAt) - millis(y.createdAt));
  else if (sort === 'date') a.sort((x, y) => ((dayOf(x) ?? Infinity) - (dayOf(y) ?? Infinity)) || (millis(y.createdAt) - millis(x.createdAt)));
  else if (sort === 'amount') a.sort((x, y) => (Number(y.amount) || 0) - (Number(x.amount) || 0));
  return a;                                                   // 'new' is the order the database gave us
}
const filteredOrders = (f) => sortList(orders.filter((b) => matchOthers(b, f) && STATUS_FILTERS[f.status](b)), f.sort);

/** (Re)builds a <select> but keeps what is chosen, even if that choice is not in the list any more. */
function fillSelect(id, options, current, allLabel) {
  const el = $(id);
  const opts = [{ value: '', label: allLabel }, ...options];
  if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: current });
  const html = opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
  el.value = current;
}

function renderOrders() {
  const f = filtersFromRoute();
  const qEl = $('q');
  // Follow the address, except while the person is still typing (the address lags a moment behind their typing)
  if (!qPending && qEl.value.trim() !== f.q) qEl.value = f.q;
  $('fDate').value = f.date;
  $('rangeBox').hidden = f.date !== 'range';
  if (document.activeElement !== $('fFrom')) $('fFrom').value = f.from;
  if (document.activeElement !== $('fTo')) $('fTo').value = f.to;
  $('sortSel').value = f.sort;

  const count = (key, label) => { const m = new Map(); orders.forEach((b) => { const k = key(b); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${label(k)} (${n})` })); };
  fillSelect('fService', count(catOf, (k) => k), f.svc, 'All services');
  fillSelect('fChannel', count(channelKey, (k) => CHANNEL[k] || k), f.ch, 'All sources');
  const people = new Map();
  orders.forEach((b) => { if (b.assignedTo && b.assignedName) people.set(b.assignedTo, b.assignedName); });
  fillSelect('fAssigned', [{ value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }, ...[...people].map(([v, n]) => ({ value: v, label: n }))], f.asg, 'Anyone');

  const base = orders.filter((b) => matchOthers(b, f));
  $('statusTabs').innerHTML = STATUS_TABS.map(([k, label]) => {
    const n = base.filter(STATUS_FILTERS[k]).length;
    return `<button type="button" role="tab" class="tab${f.status === k ? ' on' : ''}${k === 'pending' && n ? ' hot' : ''}" data-status="${k}" aria-selected="${f.status === k}">${label} <b>${n}</b></button>`;
  }).join('');

  // What is filtered, as pills that can each be removed
  const pills = [];
  if (f.date !== 'any') pills.push(['date', `Date: ${f.date === 'range' ? `${f.from || '…'} to ${f.to || '…'}` : DATE_LABELS[f.date]}`]);
  if (f.svc) pills.push(['svc', `Service: ${f.svc}`]);
  if (f.ch) pills.push(['ch', `Via: ${CHANNEL[f.ch] || f.ch}`]);
  if (f.asg) pills.push(['asg', `Assigned: ${f.asg === 'me' ? 'me' : f.asg === 'none' ? 'nobody' : (people.get(f.asg) || f.asg)}`]);
  if (f.q) pills.push(['q', `Search: “${f.q}”`]);
  if (f.sort !== 'new') pills.push(['sort', `Sorted: ${$('sortSel').selectedOptions[0]?.textContent || f.sort}`]);
  $('activeFilters').innerHTML = pills.length
    ? pills.map(([k, t]) => `<button type="button" class="pill" data-clear="${k}">${esc(t)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`).join('')
      + `<button type="button" class="pill-clear" data-clear-all>Clear all</button>` : '';
  const nf = pills.filter(([k]) => k !== 'q').length;
  $('filterCount').hidden = !nf;
  $('filterCount').textContent = nf;

  const list = filteredOrders(f);
  $('resultInfo').textContent = ordersLoaded ? `${list.length} order${list.length === 1 ? '' : 's'}${f.q ? ` matching “${f.q}”` : ''}` : 'Loading orders…';
  const filtered = f.status !== 'open' || pills.length;
  $('list').innerHTML = !ordersLoaded ? skeleton(4, 'ord-sk')
    : list.length ? `<div class="ord-head" aria-hidden="true"><span>Order</span><span>Customer</span><span>Service</span><span>When</span><span>Amount</span><span></span></div>${list.map(ordRow).join('')}`
    : orders.length && filtered
      ? `<div class="adm-empty"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i><p>No orders match these filters.</p><button type="button" class="btn-main" data-clear-all>Show active orders</button></div>`
      : `<div class="adm-empty"><i class="fa-regular fa-bell" aria-hidden="true"></i><p>No orders yet. New bookings appear here the moment they're placed.</p></div>`;
}

let qPending = false;                                // typed in the search box but not in the address yet

function bindOrders() {
  let qTimer = null;
  $('q').addEventListener('input', () => {
    qPending = true;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { qPending = false; setParams({ q: $('q').value.trim() }); }, 140);
  });
  $('statusTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-status]'); if (t) setParams({ status: t.dataset.status === 'open' ? '' : t.dataset.status }); });
  $('fDate').addEventListener('change', () => setParams({ date: $('fDate').value === 'any' ? '' : $('fDate').value, ...($('fDate').value === 'range' ? {} : { from: '', to: '' }) }));
  $('fFrom').addEventListener('change', () => setParams({ from: $('fFrom').value }));
  $('fTo').addEventListener('change', () => setParams({ to: $('fTo').value }));
  $('fService').addEventListener('change', () => setParams({ svc: $('fService').value }));
  $('fChannel').addEventListener('change', () => setParams({ ch: $('fChannel').value }));
  $('fAssigned').addEventListener('change', () => setParams({ asg: $('fAssigned').value }));
  $('sortSel').addEventListener('change', () => setParams({ sort: $('sortSel').value === 'new' ? '' : $('sortSel').value }));
  $('filtersToggle').addEventListener('click', () => {
    const open = $('filterPanel').classList.toggle('open');
    $('filtersToggle').setAttribute('aria-expanded', String(open));
  });
  const clear = (e) => {
    const one = e.target.closest('[data-clear]');
    if (one) { setParams(one.dataset.clear === 'date' ? { date: '', from: '', to: '' } : { [one.dataset.clear]: '' }); return; }
    if (e.target.closest('[data-clear-all]')) setParams({ status: '', date: '', from: '', to: '', svc: '', ch: '', asg: '', q: '', sort: '' });
  };
  $('activeFilters').addEventListener('click', clear);
  $('list').addEventListener('click', clear);
  bindOrderList($('list'));
  $('moreBtn').addEventListener('click', () => { pageSize += PAGE_SIZE; listen(); });
  $('exportBtn').addEventListener('click', exportCsv);
}

// ─── Schedule ────────────────────────────────────────────────────────────────
function renderSchedule() {
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(route.params.get('d') || '') ? route.params.get('d') : ymd(new Date());
  const t0 = todayStart();
  const live = orders.filter((b) => statusOf(b) !== 'cancelled');
  const strip = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(t0 + i * DAY);
    const key = ymd(d);
    const n = live.filter((b) => dayStr(b) === key).length;
    strip.push(`<button type="button" role="tab" class="day${key === sel ? ' on' : ''}${i === 0 ? ' now' : ''}" data-day="${key}" aria-selected="${key === sel}">
      <small>${i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</small><strong>${d.getDate()}</strong><em>${d.toLocaleDateString('en-IN', { month: 'short' })}</em>${n ? `<b>${n}</b>` : ''}</button>`);
  }
  $('dayStrip').innerHTML = strip.join('');

  const day = parseDay(sel);
  const jobs = live.filter((b) => dayStr(b) === sel).sort((a, b) => (isOpen(b) - isOpen(a)) || (millis(a.createdAt) - millis(b.createdAt)));
  const open = jobs.filter(isOpen).length;
  $('dayHead').innerHTML = `<h2>${esc(day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
    <p>${jobs.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} · ${open} still to do` : 'No jobs on this day'}</p>`;
  $('dayList').innerHTML = !ordersLoaded ? skeleton(3, 'ord-sk')
    : jobs.length ? jobs.map(ordRow).join('')
    : `<div class="adm-empty"><i class="fa-regular fa-calendar" aria-hidden="true"></i><p>Nothing booked for this day yet.</p></div>`;

  const overdue = orders.filter((b) => isOpen(b) && dayOf(b) != null && dayOf(b) < t0);
  const nodate = orders.filter((b) => isOpen(b) && dayOf(b) == null);
  $('schedExtra').innerHTML = [
    overdue.length ? `<a class="extra warn" href="#/orders?date=overdue"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span><strong>${overdue.length} overdue</strong><small>Open orders whose service date has passed</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a>` : '',
    nodate.length ? `<a class="extra" href="#/orders?date=nodate"><i class="fa-regular fa-calendar-xmark" aria-hidden="true"></i><span><strong>${nodate.length} without a date</strong><small>Call-back requests and quotes waiting for a date</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a>` : '',
  ].join('');
}

function bindSchedule() {
  $('dayStrip').addEventListener('click', (e) => { const d = e.target.closest('[data-day]'); if (d) setParams({ d: d.dataset.day === ymd(new Date()) ? '' : d.dataset.day }); });
  bindOrderList($('dayList'));
}

// ─── People: customers and team (admins) ─────────────────────────────────────
function buildCustomers() {
  const map = new Map();
  for (const b of orders) {
    const phone = digits(b.customerPhone);
    const key = phone || String(b.customerEmail || '').toLowerCase() || String(b.customerName || '').toLowerCase() || b.id;
    let c = map.get(key);
    if (!c) { c = { key, name: '', phone, email: '', n: 0, open: 0, spent: 0, last: 0 }; map.set(key, c); }
    c.n += 1;
    if (isOpen(b)) c.open += 1;
    if (statusOf(b) === 'completed') c.spent += Number(b.amount) || 0;
    const t = millis(b.createdAt);
    if (t >= c.last) { c.last = t; if (b.customerName) c.name = b.customerName; if (b.customerEmail) c.email = b.customerEmail; }
    if (!c.name && b.customerName) c.name = b.customerName;
    if (!c.email && b.customerEmail) c.email = b.customerEmail;
  }
  return [...map.values()];
}

function renderPeople() {
  if (myRole !== 'admin') return;
  const tab = route.params.get('t') === 'team' ? 'team' : 'customers';
  document.querySelectorAll('#peopleTabs [data-ptab]').forEach((b) => {
    const on = b.dataset.ptab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('p-customers').hidden = tab !== 'customers';
  $('p-team').hidden = tab !== 'team';
  const all = buildCustomers();
  $('cntCust').textContent = all.length;
  $('cntTeam').textContent = teamRows.length;
  if (tab === 'customers') renderCustomers(all);
  else paintTeam();
}

function renderCustomers(all) {
  const q = $('custQ').value.trim().toLowerCase();
  const sort = $('custSort').value;
  let list = all.filter((c) => !q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q));
  list.sort(sort === 'orders' ? (a, b) => b.n - a.n || b.last - a.last : sort === 'spent' ? (a, b) => b.spent - a.spent || b.last - a.last : (a, b) => b.last - a.last);
  $('custInfo').textContent = ordersLoaded ? `${list.length} customer${list.length === 1 ? '' : 's'}${q ? ` matching “${$('custQ').value.trim()}”` : ''}` : 'Loading…';
  $('custList').innerHTML = !ordersLoaded ? skeleton(4, 'ord-sk')
    : list.length ? list.map((c) => `
      <article class="cust" tabindex="0" data-find="${esc(c.phone || c.email || c.name)}">
        <span class="avatar" aria-hidden="true">${esc(initials(c.name || c.email))}</span>
        <div class="cust-t"><strong>${esc(c.name || 'Customer')}${c.n > 1 ? ' <span class="repeat">Repeat</span>' : ''}</strong>
          <small>${c.phone ? `+91 ${esc(fmt10(c.phone))}` : ''}${c.phone && c.email ? ' · ' : ''}${esc(c.email)}</small></div>
        <div class="cust-n"><strong>${c.n}</strong><small>order${c.n === 1 ? '' : 's'}${c.open ? ` · ${c.open} open` : ''}</small></div>
        <div class="cust-n"><strong>${c.spent ? `₹${inr(c.spent)}` : '—'}</strong><small>spent</small></div>
        <div class="cust-n cust-last"><strong>${esc(ago(c.last))}</strong><small>last order</small></div>
        <div class="cust-act">${c.phone ? `<a class="ia" href="tel:+91${c.phone}" aria-label="Call ${esc(c.name || 'customer')}"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>
          <a class="ia ia-wa" href="https://wa.me/91${c.phone}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(c.name || 'customer')}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>` : ''}</div>
      </article>`).join('')
    : `<div class="adm-empty"><i class="fa-solid fa-users" aria-hidden="true"></i><p>${q ? 'No customer matches that search.' : 'Customers appear here after their first booking.'}</p></div>`;
}

function bindPeople() {
  $('peopleTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-ptab]'); if (t) setParams({ t: t.dataset.ptab === 'customers' ? '' : t.dataset.ptab }); });
  $('custQ').addEventListener('input', () => renderPeople());
  $('custSort').addEventListener('change', () => renderPeople());
  const open = (e) => {
    if (e.target.closest('a')) return;
    const c = e.target.closest('[data-find]');
    if (c) location.hash = hashFor('orders', new URLSearchParams({ status: 'all', q: c.dataset.find }));
  };
  $('custList').addEventListener('click', open);
  $('custList').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.cust')) open(e); });
}

// ─── Team (admins) ───────────────────────────────────────────────────────────
function startTeam() {
  if (myRole !== 'admin') return;
  teamUnsub?.();
  teamUnsub = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['admin', 'staff'])), (snap) => {
    teamRows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.role === b.role ? String(a.name || '').localeCompare(String(b.name || '')) : (a.role === 'admin' ? -1 : 1)));
    teamLoaded = true;
    if (editing && !editBusy) {                      // the person being edited was changed by someone else
      const now = teamRows.find((r) => r.uid === editing.uid);
      if (!now) { closeEdit(); toast('That person is no longer on the team.'); }
      else if (now.role !== editing.role || phoneOf(now) !== phoneOf(editing)) { closeEdit(); toast('This person was just changed. Open them again to see the latest.'); }
      else editing = now;
    }
    render();
  }, (err) => {
    console.error('[admin] team list failed', err);
    teamLoaded = false;
  });
}

function paintTeam() {
  const list = $('teamList');
  if (!teamRows.length) { list.innerHTML = `<li class="tv-empty">${teamLoaded ? 'No staff yet. Add the first one below.' : 'Loading your team…'}</li>`; return; }
  list.innerHTML = teamRows.map((r) => {
    const isMe = me && r.uid === me.uid;
    const phone = String(r.adminPhone || r.phone || '');
    const d = digits(phone);
    const jobs = orders.filter((b) => b.assignedTo === r.uid && isOpen(b)).length;
    const who = r.name || 'this team member';
    return `<li class="tv-row" data-uid="${esc(r.uid)}">
      <span class="avatar" aria-hidden="true">${r.name ? esc(initials(r.name)) : '<i class="fa-solid fa-user"></i>'}</span>
      <span class="tv-who"><strong>${r.name ? esc(r.name) : '<span class="unnamed">No name yet</span>'}${isMe ? ' <em>(you)</em>' : ''}
          <span class="tv-role r-${esc(r.role)}">${r.role === 'admin' ? 'Admin' : 'Staff'}</span>${r.name ? '' : ' <span class="tv-add">Add a name</span>'}</strong>
        <small>${d ? `+91 ${fmt10(d)}` : esc(phone)}${jobs ? ` · ${jobs} open job${jobs === 1 ? '' : 's'}` : ''}</small></span>
      ${d ? `<a class="ia" href="tel:+91${d}" aria-label="Call ${esc(who)}"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>` : ''}
      <button type="button" class="ia tv-edit" data-edit="${esc(r.uid)}" aria-label="Edit ${esc(who)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
    </li>`;
  }).join('');
}

function tvMsg(id, text, ok = false) {
  const el = $(id);
  el.textContent = text || '';
  el.classList.toggle('ok', !!ok);
}

/** Plain-English text for a Cloud Functions error (the functions already word theirs for people). */
function callError(err) {
  const code = String(err?.code || '');
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded' || !navigator.onLine) return 'Could not reach the server. Check your connection and try again.';
  if (code === 'functions/internal' || code === 'functions/unknown' || !code.startsWith('functions/')) return 'Something went wrong. Please try again.';
  return err.message || 'Something went wrong. Please try again.';
}

function bindTeam() {
  $('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    tvMsg('staffMsg', '');
    $('staffInvite').hidden = true;
    const name = $('stName').value.trim().replace(/\s+/g, ' ');
    const phone = mobile10($('stPhone').value);
    if (name.length < 2) { tvMsg('staffMsg', "Enter the staff member's name."); $('stName').focus(); return; }
    if (!phone) { tvMsg('staffMsg', 'Enter a valid 10-digit mobile number.'); $('stPhone').focus(); return; }
    const btn = $('staffAdd');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      const r = await callFunction('addStaff', { phone, name });
      tvMsg('staffMsg', `${r.name || name} can now sign in with +91 ${fmt10(phone)}.`, true);
      $('staffInvite').href = inviteLink(r.name || name, phone);
      $('staffInvite').hidden = false;
      $('staffForm').reset();
    } catch (err) {
      console.warn('[admin] addStaff failed', err?.code || err);
      tvMsg('staffMsg', callError(err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  // Tap a person (or the pencil) to edit them. The Call link still just calls.
  $('teamList').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const row = e.target.closest('[data-uid]');
    if (row) openEdit(row.dataset.uid);
  });

  $('editForm').addEventListener('submit', saveEdit);
  $('edCancel').addEventListener('click', closeEdit);
  $('edClose').addEventListener('click', closeEdit);
  $('edRemove').addEventListener('click', removeFromEdit);
  $('edRoleBox').addEventListener('change', syncEdit);
  $('editWrap').addEventListener('keydown', (e) => {
    if (!$('dlgWrap').hidden) return;                // the "are you sure?" box is on top: it handles keys itself
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEdit(); return; }
    if (e.key !== 'Tab') return;                     // keep the focus inside the window
    const usable = (el) => !el.disabled && el.offsetParent !== null && (el.type !== 'radio' || el.checked);
    const items = [...$('editWrap').querySelectorAll('input, button, a[href]')].filter(usable);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/** The WhatsApp message that tells a new team member how to sign in. */
function inviteLink(name, phone) {
  const first = String(name || 'there').trim().split(/\s+/)[0] || 'there';
  return `https://wa.me/91${phone}?text=${encodeURIComponent(
    `Hi ${first}, you've been added to the MyNeedUrban team. Sign in with this mobile number to see live orders: ${location.origin}${location.pathname}`)}`;
}

// ─── Edit a team member (admins) ─────────────────────────────────────────────
//   Name: anyone on the team. Number: staff only (never an admin's, so nobody is locked
//   out). Role: staff ↔ admin, never your own. The updateTeamMember function enforces
//   all of this again; this window only explains it and sends what actually changed.
let editing = null;                                  // the team row in the window
let editBusy = false;                                // a save is on its way
let editReturn = null;                               // where the focus goes back to
let editSession = 0;                                 // changes whenever the window opens or closes, so a slow answer can't act on a newer window
const phoneOf = (r) => digits(r?.adminPhone || r?.phone);
const editRole = () => document.querySelector('input[name="edRole"]:checked')?.value || editing?.role || '';

function openEdit(uid) {
  const r = teamRows.find((x) => x.uid === uid);
  if (!r || myRole !== 'admin' || !me) return;
  editing = r;
  editBusy = false;
  editSession += 1;
  editReturn = document.activeElement;
  const mine = r.uid === me.uid;
  const d = phoneOf(r);
  $('edAv').innerHTML = r.name ? esc(initials(r.name)) : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  $('edTitle').textContent = r.name ? `Edit ${r.name}` : 'Add a name';
  $('edSub').textContent = `${r.role === 'admin' ? 'Admin' : 'Staff'}${mine ? ' · this is you' : ''}`;
  $('edName').value = r.name || '';
  $('edPhone').value = d ? fmt10(d) : '';
  $('edRoleBox').hidden = mine;                      // you cannot change your own role
  document.querySelectorAll('input[name="edRole"]').forEach((i) => { i.checked = i.value === r.role; });
  $('edRemove').hidden = mine || r.role !== 'staff';
  $('edSave').disabled = false;
  $('edSave').textContent = 'Save changes';
  $('edRemove').disabled = false;
  tvMsg('edMsg', '');
  syncEdit();
  $('editWrap').hidden = false;
  document.body.classList.add('no-scroll');
  $('edName').focus();
  $('edName').select();
}

/** Show what can be changed for this person right now. */
function syncEdit() {
  if (!editing) return;
  const staffNow = editing.role === 'staff';
  const promoting = staffNow && editRole() === 'admin';
  const locked = !staffNow || promoting;
  const original = phoneOf(editing);
  if (locked) $('edPhone').value = original ? fmt10(original) : '';
  $('edPhone').readOnly = locked;
  $('edPhoneHint').textContent = !staffNow
    ? (editing.uid === me?.uid ? "This is the number you sign in with, so it can't be changed here." : "An admin's number can't be changed here. Make them staff first if it has to change.")
    : promoting ? 'Save the new role first. After that you can change the number.'
      : 'The number they sign in with. If you change it they are signed out, and must use the new number.';
  const canInvite = !!original && editing.uid !== me?.uid;     // no point sending yourself the link
  $('edInvite').hidden = !canInvite;
  if (canInvite) $('edInvite').href = inviteLink(editing.name, original);
}

function closeEdit() {
  if ($('editWrap').hidden) return;
  $('editWrap').hidden = true;
  editing = null;
  editBusy = false;
  editSession += 1;
  document.body.classList.remove('no-scroll');
  editReturn?.focus?.({ preventScroll: true });
  editReturn = null;
}

async function saveEdit(e) {
  e.preventDefault();
  const r = editing;
  if (!r || editBusy) return;
  tvMsg('edMsg', '');
  const name = $('edName').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) { tvMsg('edMsg', 'Enter a name (at least 2 letters).'); $('edName').focus(); return; }
  const payload = { uid: r.uid };
  if (name !== (r.name || '')) payload.name = name;
  if (!$('edPhone').readOnly) {
    const phone = mobile10($('edPhone').value);
    if (!phone) { tvMsg('edMsg', 'Enter a valid 10-digit mobile number.'); $('edPhone').focus(); return; }
    if (phone !== phoneOf(r)) payload.phone = phone;
  }
  const role = editRole();
  if (r.uid !== me.uid && role && role !== r.role) payload.role = role;
  if (Object.keys(payload).length === 1) { closeEdit(); toast('Nothing was changed'); return; }

  const session = editSession;
  const who = payload.name || r.name || 'this person';
  if (payload.role === 'admin' && !await ask({ title: `Make ${who} an admin?`, text: 'Admins can see everything: all orders and customers, the team, and the email settings. Only do this for someone you fully trust.', ok: 'Make admin' })) return;
  if (payload.role === 'staff' && !await ask({ title: `Make ${who} staff?`, text: 'They will no longer see People or Settings, and can only work on orders.', ok: 'Make staff', danger: true })) return;
  if (session !== editSession) return;               // closed or changed while the question was open

  editBusy = true;
  $('edSave').disabled = true;
  const label = $('edSave').textContent;
  $('edSave').textContent = 'Saving…';
  try {
    await callFunction('updateTeamMember', payload);
    toast(`${who} updated`);
    if (session === editSession) closeEdit();        // not if the window was closed or reopened for someone else meanwhile
  } catch (err) {
    console.warn('[admin] updateTeamMember failed', err?.code || err);
    if (session !== editSession) { toast(callError(err)); return; }
    tvMsg('edMsg', callError(err));
    editBusy = false;
    $('edSave').disabled = false;
    $('edSave').textContent = label;
  }
}

async function removeFromEdit() {
  const r = editing;
  if (!r || editBusy) return;
  const session = editSession;
  const ok = await ask({ title: `Remove ${r.name || 'this staff member'}?`, text: 'They will lose access to the admin app straight away and be signed out everywhere. Their past work stays on the orders.', ok: 'Remove', danger: true });
  if (!ok || session !== editSession) return;
  editBusy = true;
  $('edRemove').disabled = true;
  try {
    await callFunction('removeStaff', { uid: r.uid });
    toast(`${r.name || 'Staff member'} removed`);
    if (session === editSession) closeEdit();
  } catch (err) {
    console.warn('[admin] removeStaff failed', err?.code || err);
    if (session !== editSession) { toast(callError(err)); return; }
    tvMsg('edMsg', callError(err));
    editBusy = false;
    $('edRemove').disabled = false;
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────
const MAX_ALERT_EMAILS = 5;
let draft = { ownerEmails: [], emailOwnerOnNewBooking: true, emailCustomers: true };
let draftReady = false;                              // the saved settings have been read
let draftDirty = false;
let draftLoading = false;

function renderSettings() {
  $('setWho').textContent = `${myName ? `${myName} · ` : ''}${myRole === 'admin' ? 'Admin' : 'Staff'} · ${me?.phoneNumber || me?.email || ''}`;
  paintAlerts();
  paintAwake();
  if (myRole === 'admin') {
    if (!draftReady && !draftLoading) loadAlerts();
    else paintMailSettings();
  }
}

function paintMailSettings() {
  const list = $('emailList');
  list.innerHTML = draft.ownerEmails.length
    ? draft.ownerEmails.map((e, i) => `<li class="tv-row">
        <span class="avatar" aria-hidden="true"><i class="fa-regular fa-envelope"></i></span>
        <span class="tv-who"><strong>${esc(e)}</strong></span>
        <button type="button" class="tv-x" data-drop="${i}" aria-label="Remove ${esc(e)}"${draft.ownerEmails.length === 1 ? ' disabled title="At least one address is needed"' : ''}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </li>`).join('')
    : `<li class="tv-empty">${draftReady ? 'No address saved yet. Add one below.' : 'Loading…'}</li>`;
  $('tgOwner').checked = draft.emailOwnerOnNewBooking;
  $('tgCustomer').checked = draft.emailCustomers;
  $('emAdd').disabled = draft.ownerEmails.length >= MAX_ALERT_EMAILS;
  $('emNew').disabled = draft.ownerEmails.length >= MAX_ALERT_EMAILS;
  $('alertSave').disabled = !draftReady || !draftDirty || !draft.ownerEmails.length;
}

async function loadAlerts() {
  draftLoading = true;
  draftReady = false;
  paintMailSettings();
  try {
    const snap = await getDoc(doc(db, 'settings', 'notifications'));
    const d = snap.exists() ? snap.data() : {};
    draft = {
      ownerEmails: Array.isArray(d.ownerEmails) ? d.ownerEmails.filter((e) => EMAIL_OK.test(e)).slice(0, MAX_ALERT_EMAILS) : [],
      emailOwnerOnNewBooking: d.emailOwnerOnNewBooking !== false,
      emailCustomers: d.emailCustomers !== false,
    };
    draftReady = true;
    draftDirty = false;
    tvMsg('alertMsg', snap.exists() ? '' : 'Nothing saved yet. Add an address and save: until then, emails go to the owner address set up with the system.');
  } catch (err) {
    console.error('[admin] alert settings read failed', err);
    tvMsg('alertMsg', "Couldn't load the email settings. Check your connection and reopen Settings.");
  } finally {
    draftLoading = false;
  }
  paintMailSettings();
}

function markDirty() { draftDirty = true; tvMsg('alertMsg', ''); paintMailSettings(); }

function bindSettings() {
  $('alertsSwitch').addEventListener('click', () => $('alertsBtn').click());
  $('signOutBtn').addEventListener('click', () => signOut(auth));
  $('signOutBtn2').addEventListener('click', () => signOut(auth));

  $('emailForm').addEventListener('submit', (e) => {
    e.preventDefault();
    tvMsg('alertMsg', '');
    const v = $('emNew').value.trim();
    if (!EMAIL_OK.test(v)) { tvMsg('alertMsg', 'Enter one valid email address, like name@gmail.com.'); $('emNew').focus(); return; }
    if (draft.ownerEmails.some((x) => x.toLowerCase() === v.toLowerCase())) { tvMsg('alertMsg', 'That address is already in the list.'); return; }
    if (draft.ownerEmails.length >= MAX_ALERT_EMAILS) { tvMsg('alertMsg', `You can add up to ${MAX_ALERT_EMAILS} addresses.`); return; }
    draft.ownerEmails.push(v);
    $('emNew').value = '';
    markDirty();
  });
  $('emailList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-drop]');
    if (!b || draft.ownerEmails.length <= 1) return;
    draft.ownerEmails.splice(Number(b.dataset.drop), 1);
    markDirty();
  });
  $('tgOwner').addEventListener('change', () => { draft.emailOwnerOnNewBooking = $('tgOwner').checked; markDirty(); });
  $('tgCustomer').addEventListener('change', () => { draft.emailCustomers = $('tgCustomer').checked; markDirty(); });
  $('alertSave').addEventListener('click', async () => {
    if (!me || myRole !== 'admin' || !draft.ownerEmails.length) return;
    const btn = $('alertSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await setDoc(doc(db, 'settings', 'notifications'), {
        ownerEmails: [...draft.ownerEmails],
        emailOwnerOnNewBooking: draft.emailOwnerOnNewBooking,
        emailCustomers: draft.emailCustomers,
        updatedBy: me.uid,
        updatedAt: serverTimestamp(),
      });
      draftDirty = false;
      tvMsg('alertMsg', 'Saved. New bookings will be emailed to these addresses within a minute.', true);
      toast('Email settings saved');
    } catch (err) {
      console.error('[admin] alert settings save failed', err);
      tvMsg('alertMsg', err?.code === 'permission-denied'
        ? "You don't have permission to change these settings."
        : "Couldn't save. Check your connection and try again.");
    } finally {
      btn.textContent = 'Save email settings';
      paintMailSettings();
    }
  });
}

// ─── Order details (side panel on desktop, sheet on phones) ──────────────────
function openOrder(id) {
  lastFocus = document.activeElement;
  drawerPushed = true;                               // so Back closes the panel
  const p = new URLSearchParams(route.params);
  p.set('o', id);
  location.hash = hashFor(route.name, p);
}

function closeOrder() {
  if (!drawerId) return;
  if (drawerPushed) { drawerPushed = false; history.back(); return; }
  const p = new URLSearchParams(route.params);
  p.delete('o');
  history.replaceState(null, '', hashFor(route.name, p));
  route = { name: route.name, params: p };
  syncDrawer('');
}

function syncDrawer(id) {
  if (id === drawerId) return;
  drawerId = id;
  drawerEdits.clear();
  const wrap = $('drawerWrap');
  if (!id) {
    wrap.hidden = true;
    document.body.classList.remove('no-scroll');
    $('drawer').innerHTML = '';
    drawerPushed = false;
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
    return;
  }
  wrap.hidden = false;
  document.body.classList.add('no-scroll');
  paintDrawer();
  $('drawer').scrollTop = 0;
  ($('drawer').querySelector('[data-close]') || $('drawer')).focus({ preventScroll: true });
}

/**
 * Redraw the open order when the data changes (a status moved, someone else
 * edited it). Words typed into the note or date box and not saved yet are put
 * back, with the cursor where it was, so a redraw never eats what you typed.
 */
function refreshDrawer() {
  if (!drawerId) return;
  const a = document.activeElement;
  const focusId = a && $('drawer').contains(a) ? a.id : '';
  const caret = focusId && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  const typed = [...drawerEdits].filter((id) => $(id)).map((id) => [id, $(id).value]);
  paintDrawer();
  typed.forEach(([id, v]) => { if ($(id)) $(id).value = v; });
  const back = focusId && $(focusId);
  if (back) {
    back.focus({ preventScroll: true });
    if (caret) { try { back.setSelectionRange(caret[0], caret[1]); } catch (_) { /* a date box has no cursor */ } }
  }
}

function paintDrawer() {
  const b = orderById(drawerId);
  const el = $('drawer');
  if (!b) {
    el.innerHTML = `<header class="d-head"><h2 id="drawerTitle">${ordersLoaded ? 'Order not found' : 'Loading…'}</h2><button type="button" class="icon-btn" data-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>
      <div class="d-body"><p class="tv-sub">${ordersLoaded ? "This order isn't in the newest orders loaded. Open Orders and tap “Load older orders”." : 'One moment…'}</p></div>`;
    return;
  }
  const st = statusOf(b), S = STATUS[st];
  const phone = digits(b.customerPhone), alt = digits(b.customerAltPhone);
  const w = whenParts(b);
  const d = parseDay(b.scheduledDate);
  const maps = mapsUrl(b);
  const qty = Number(b.quantity) || 1;
  const amount = Number(b.amount) > 0 ? `₹${inr(b.amount)}` : (b.channel === 'callback' ? 'Call-back request' : 'Price after visit');
  const mrp = Number(b.mrp) > 0 && Number(b.amount) > 0 && Number(b.mrp) * qty > Number(b.amount) ? Number(b.mrp) * qty : 0;
  const idx = FLOW.indexOf(st);
  const isAdminUser = myRole === 'admin';
  const created = millis(b.createdAt);

  const steps = st === 'cancelled'
    ? '<div class="d-cancelled"><i class="fa-solid fa-ban" aria-hidden="true"></i> This order was cancelled</div>'
    : `<ol class="steps" aria-label="Progress: ${S.label}">${FLOW.map((k, i) => `
        <li class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"><span><i class="fa-solid ${i < idx ? 'fa-check' : ['fa-receipt', 'fa-circle-check', 'fa-broom', 'fa-flag-checkered'][i]}" aria-hidden="true"></i></span><small>${STATUS[k].label}</small></li>`).join('')}</ol>`;

  const hist = [];
  if (created) hist.push([created, 'Order placed', `${channelLabel(b)}${b.isGuest ? ' · guest' : ''}`]);
  [['confirmed', 'Confirmed'], ['inProgress', 'Work started'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].forEach(([k, label]) => {
    if (b[`${k}At`]) hist.push([millis(b[`${k}At`]), label, '']);
  });
  hist.sort((a, c) => a[0] - c[0]);
  const lastBy = teamRows.find((r) => r.uid === b.updatedBy);

  const assignOptions = ['<option value="">Unassigned</option>', ...teamRows.map((r) => `<option value="${esc(r.uid)}"${b.assignedTo === r.uid ? ' selected' : ''}>${esc(r.name || r.adminPhone || 'Team member')}${r.role === 'admin' ? ' (admin)' : ''}</option>`)];
  if (b.assignedTo && !teamRows.some((r) => r.uid === b.assignedTo)) assignOptions.push(`<option value="${esc(b.assignedTo)}" selected>${esc(b.assignedName || 'Assigned')}</option>`);

  el.innerHTML = `
  <header class="d-head">
    <div class="d-title">
      <h2 id="drawerTitle">${esc(b.serviceName || 'Order')}</h2>
      <p>${b.orderId ? `<button type="button" class="oid" data-copy="${esc(b.orderId)}" title="Copy order ID">${esc(b.orderId)} <i class="fa-regular fa-copy" aria-hidden="true"></i></button>` : ''}<span class="badge b-${st}">${S.label}</span></p>
    </div>
    <button type="button" class="icon-btn" data-close aria-label="Close details"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
  </header>
  <div class="d-body">
    ${steps}
    <div class="d-actions">
      ${S.next ? `<button type="button" class="go go-${st} go-lg" data-act="next" data-to="${S.next}"><i class="fa-solid ${S.icon}" aria-hidden="true"></i><span>${S.nextLabel}</span></button>` : ''}
      ${st === 'cancelled' ? `<button type="button" class="go go-pending go-lg" data-act="back" data-to="pending"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Reopen as New</span></button>` : ''}
      ${phone ? `<a class="ia ia-lg" href="tel:+91${phone}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>Call</span></a>
      <a class="ia ia-lg ia-wa" href="${waUrl(b, phone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>` : ''}
      ${maps ? `<a class="ia ia-lg" href="${esc(maps)}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i><span>Navigate</span></a>` : ''}
    </div>

    <section class="d-sec"><h4>Service &amp; price</h4>
      <dl class="d-grid">
        <div class="wide"><dt>Service</dt><dd>${esc(b.servicePath || b.serviceName || '—')}</dd></div>
        <div><dt>Price</dt><dd><strong>${esc(amount)}</strong>${mrp ? ` <s>₹${inr(mrp)}</s>` : ''}${qty > 1 ? ` · qty ${qty}` : ''}</dd></div>
        ${b.venueType ? `<div><dt>Venue</dt><dd>${esc(b.venueType)}</dd></div>` : ''}
      </dl>
    </section>

    <section class="d-sec"><h4>Customer</h4>
      <dl class="d-grid">
        <div><dt>Name</dt><dd>${esc(b.customerName || '—')}</dd></div>
        <div><dt>Mobile</dt><dd>${phone ? `<a href="tel:+91${phone}">+91 ${fmt10(phone)}</a>` : '—'}${alt ? `<br /><a href="tel:+91${alt}">+91 ${fmt10(alt)}</a> <small>alt</small>` : ''}</dd></div>
        ${b.customerEmail ? `<div class="wide"><dt>Email</dt><dd>${EMAIL_OK.test(b.customerEmail) ? `<a href="mailto:${esc(b.customerEmail)}">${esc(b.customerEmail)}</a>` : esc(b.customerEmail)}</dd></div>` : ''}
      </dl>
    </section>

    <section class="d-sec"><h4>When &amp; where</h4>
      <dl class="d-grid">
        <div class="wide"><dt>Service date</dt><dd class="${w.cls}">${d ? esc(d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : 'Not set'}${b.timeSlot ? ` · ${esc(b.timeSlot)}` : ''}</dd></div>
        ${b.address ? `<div class="wide"><dt>Address${b.geo ? ' <span class="gps">GPS pinned</span>' : ''}</dt><dd>${esc(String(b.address).replace(/\n+/g, ', '))}</dd></div>` : ''}
      </dl>
      ${isOpen(b) ? `<div class="d-inline"><label for="dDate"><span>Change the service date</span><input type="date" id="dDate" value="${esc(dayStr(b))}" /></label>
        <button type="button" class="btn-line" data-act="saveDate">Save date</button></div>` : ''}
    </section>

    <section class="d-sec"><h4>Team</h4>
      ${isAdminUser
        ? `<label class="d-field" for="dAssign"><span>Assigned to</span><select id="dAssign">${assignOptions.join('')}</select></label>`
        : `<p class="d-text">${b.assignedName ? `Assigned to <strong>${esc(b.assignedName)}</strong>` : 'Not assigned yet'}</p>`}
    </section>

    <section class="d-sec"><h4>Notes</h4>
      ${b.notes ? `<div class="d-note cust-note"><small>From the customer</small><p>${esc(b.notes)}</p></div>` : ''}
      <label class="d-field" for="dNote"><span>Staff note <em>(only the team sees this)</em></span>
        <textarea id="dNote" rows="3" maxlength="500" placeholder="e.g. Call after 6 pm, gate code 4821">${esc(b.adminNote || '')}</textarea></label>
      <button type="button" class="btn-line" data-act="saveNote">Save note</button>
    </section>

    <section class="d-sec"><h4>History</h4>
      <ol class="hist">${hist.map(([t, label, sub]) => `<li><strong>${esc(label)}</strong><small>${esc(fmtDateTime({ toMillis: () => t }))}${sub ? ` · ${esc(sub)}` : ''}</small></li>`).join('')}</ol>
      ${b.updatedAt ? `<p class="d-text d-small">Last updated ${esc(ago(b.updatedAt))}${lastBy ? ` by ${esc(lastBy.name || 'a team member')}` : ''}.</p>` : ''}
    </section>

    ${isOpen(b) || st === 'completed' ? `<div class="d-danger">
      ${PREV[st] && st !== 'cancelled' ? `<button type="button" class="btn-line" data-act="back" data-to="${PREV[st]}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Move back to ${STATUS[PREV[st]].label}</span></button>` : ''}
      ${isOpen(b) ? `<button type="button" class="btn-line danger" data-act="cancel"><i class="fa-solid fa-ban" aria-hidden="true"></i><span>Cancel order</span></button>` : ''}
    </div>` : ''}
  </div>`;
}

function bindDrawer() {
  $('drawerWrap').addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) { closeOrder(); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy, 'Order ID copied'); return; }
    const btn = e.target.closest('[data-act]');
    const b = orderById(drawerId);
    if (!btn || !b) return;
    const act = btn.dataset.act;
    if (act === 'next') { setStatus(b, btn.dataset.to, btn); return; }
    if (act === 'back') {
      const to = btn.dataset.to;
      const ok = await ask({ title: `Move back to “${STATUS[to].label}”?`, text: `${b.orderId || 'This order'} will go back one step.`, ok: 'Move back' });
      if (ok) setStatus(b, to, btn);
      return;
    }
    if (act === 'cancel') {
      const ok = await ask({ title: 'Cancel this order?', text: `${b.orderId || 'This order'} for ${b.customerName || 'this customer'} will be cancelled and the customer will see it as cancelled.`, ok: 'Cancel order', no: 'Keep it', danger: true });
      if (ok) setStatus(b, 'cancelled', btn);
      return;
    }
    if (act === 'saveNote') { saveNote(b, $('dNote').value.trim().slice(0, 500), btn); return; }
    if (act === 'saveDate') { saveDate(b, $('dDate').value, btn); }
  });
  $('drawerWrap').addEventListener('change', (e) => {
    if (e.target.id === 'dAssign') { const b = orderById(drawerId); if (b) assignTo(b, e.target.value); }
  });
  $('drawerWrap').addEventListener('input', (e) => {
    if (e.target.id === 'dNote' || e.target.id === 'dDate') drawerEdits.add(e.target.id);
  });
}

// ─── A friendly "are you sure?" ──────────────────────────────────────────────
function ask({ title, text, ok = 'Yes', no = 'Back', danger = false }) {
  return new Promise((resolve) => {
    const yes = $('dlgYes'), nope = $('dlgNo');
    $('dlgTitle').textContent = title;
    $('dlgText').textContent = text;
    yes.textContent = ok;
    nope.textContent = no;
    yes.classList.toggle('danger', danger);
    const before = document.activeElement;
    $('dlgWrap').hidden = false;
    (danger ? nope : yes).focus();
    const done = (v) => {
      $('dlgWrap').hidden = true;
      yes.onclick = nope.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.({ preventScroll: true });
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Tab') {                           // keep the focus inside the dialog
        e.preventDefault();
        (document.activeElement === yes ? nope : yes).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    yes.onclick = () => done(true);
    nope.onclick = () => done(false);
  });
}

// ─── Changing an order ───────────────────────────────────────────────────────
function failMessage(err, what) {
  return err?.code === 'permission-denied' ? "You don't have permission to do that." : `Could not ${what}. Check your connection and try again.`;
}

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
    toast(failMessage(err, 'update the order'));
  }
}

async function saveNote(b, text, btn) {
  if (btn) btn.disabled = true;
  try {
    await updateDoc(doc(db, 'bookings', b.id), { adminNote: text, updatedAt: serverTimestamp(), updatedBy: me?.uid || null });
    drawerEdits.delete('dNote');
    toast(text ? 'Staff note saved' : 'Staff note removed');
  } catch (err) {
    console.error('[admin] note failed', err);
    toast(failMessage(err, 'save the note'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveDate(b, value, btn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { toast('Pick a date first.'); return; }
  if (value === dayStr(b)) { toast('That is already the service date.'); return; }
  if (btn) btn.disabled = true;
  try {
    await updateDoc(doc(db, 'bookings', b.id), { scheduledDate: value, updatedAt: serverTimestamp(), updatedBy: me?.uid || null });
    drawerEdits.delete('dDate');
    toast(`Service date changed to ${parseDay(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`);
  } catch (err) {
    console.error('[admin] date change failed', err);
    toast(failMessage(err, 'change the date'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function assignTo(b, uid) {
  const person = teamRows.find((r) => r.uid === uid);
  try {
    await updateDoc(doc(db, 'bookings', b.id), {
      assignedTo: uid || null,
      assignedName: uid ? String(person?.name || person?.adminPhone || 'Team member').slice(0, 60) : null,
      updatedAt: serverTimestamp(),
      updatedBy: me?.uid || null,
    });
    toast(uid ? `Assigned to ${person?.name || 'team member'}` : 'Unassigned');
  } catch (err) {
    console.error('[admin] assign failed', err);
    toast(failMessage(err, 'assign the order'));
    paintDrawer();
  }
}

// ─── CSV export (what's on screen, with the current filters) ─────────────────
function exportCsv() {
  const rows = filteredOrders(filtersFromRoute());
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
    ['Assigned to', (b) => b.assignedName],
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
  const a = Object.assign(document.createElement('a'), { href: url, download: `myneedurban-orders-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Exported ${rows.length} order${rows.length === 1 ? '' : 's'}`);
}

// ─── Starting, stopping and shortcuts ────────────────────────────────────────
let profileUnsub = null;

/**
 * Watch my own profile. If an admin changes my role or my registered number (or removes me),
 * this page follows at once: it checks access again and shows the right screens, or the
 * "No team access" screen. Without this the page would keep the old screens until reloaded.
 */
function watchProfile(user) {
  profileUnsub?.();
  profileUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
    if (auth.currentUser?.uid !== user.uid) return;
    const d = snap.exists() ? snap.data() : {};
    if (d.role !== myRole || String(d.adminPhone || '') !== user.phoneNumber) {
      resetApp();
      checkAccess(user);
      return;
    }
    const name = String(d.name || '').trim();
    if (name !== myName) { myName = name; renderCurrent(); }
  }, (err) => console.warn('[admin] profile watch failed', err?.code || err));
}

/** The app opens for a signed-in team member. */
function startApp(user, role, name) {
  me = user;
  myRole = role;
  myName = name;
  ordersLoaded = false;
  teamLoaded = false;
  draftReady = false;
  viewDrawn = false;
  $('gate').hidden = true;
  $('dash').hidden = false;
  $('alertsBtn').hidden = false;
  paintChrome();
  paintAlerts();
  listen();
  startTeam();
  watchProfile(user);
  if (alertsOn && window.Notification?.permission === 'granted') registerPush();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/overview');
  handleRoute();
}

/** Forget everything on screen: a shared phone must not keep names, numbers and addresses after sign-out. */
function resetApp() {
  stopListening();
  teamUnsub?.();
  teamUnsub = null;
  profileUnsub?.();
  profileUnsub = null;
  me = null; myRole = ''; myName = '';
  orders = [];
  teamRows = [];
  ordersLoaded = false;
  teamLoaded = false;
  draft = { ownerEmails: [], emailOwnerOnNewBooking: true, emailCustomers: true };
  draftReady = false; draftDirty = false; draftLoading = false;
  seen.clear();
  fresh.clear();
  clearUnread();
  $('admToast').classList.remove('show');
  $('admToast').textContent = '';
  // Nothing of the last person's work stays in the page: not a toast, a name or an option list
  ['fService', 'fChannel', 'fAssigned'].forEach((id) => { $(id).innerHTML = ''; delete $(id).dataset.sig; });
  ['whoName', 'whoAv', 'whoami', 'setWho', 'helloTitle', 'helloSub', 'resultInfo', 'custInfo'].forEach((id) => { $(id).textContent = ''; });
  drawerId = ''; drawerPushed = false; drawerEdits.clear();
  $('drawerWrap').hidden = true;
  $('drawer').innerHTML = '';
  $('editWrap').hidden = true;
  $('editForm').reset();
  editing = null; editBusy = false; editReturn = null;
  tvMsg('edMsg', '');
  document.body.classList.remove('no-scroll');
  document.documentElement.removeAttribute('data-role');
  ['list', 'dayList', 'custList', 'teamList', 'emailList', 'ovAction', 'ovToday', 'ovOverdue', 'kpis', 'ovChart', 'ovServices', 'statusTabs', 'activeFilters', 'schedExtra', 'dayStrip', 'dayHead']
    .forEach((id) => { $(id).innerHTML = ''; });
  ['q', 'gSearch', 'custQ'].forEach((id) => { $(id).value = ''; });
  $('staffForm').reset();
  $('emailForm').reset();
  $('staffInvite').hidden = true;
  tvMsg('staffMsg', '');
  tvMsg('alertMsg', '');
  $('dash').hidden = true;
  viewDrawn = false;
}

function bindShell() {
  // Desktop quick search: jumps to Orders with the search filled in
  $('gSearch').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = $('gSearch').value.trim();
    $('gSearch').value = '';
    location.hash = hashFor('orders', new URLSearchParams({ status: 'all', ...(q ? { q } : {}) }));
  });
  const windowOpen = () => !$('dlgWrap').hidden || !$('editWrap').hidden;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerId && !windowOpen()) { closeOrder(); return; }
    if (e.key === '/' && me && !windowOpen() && !drawerId && !e.target.closest('input, textarea, select, [contenteditable]') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      // The search box that belongs to the page; pages without one open Orders with its search ready.
      const own = route.name === 'orders' ? $('q')
        : route.name === 'people' && !$('p-customers').hidden ? $('custQ')
          : $('gSearch');
      if (own.offsetParent !== null) { own.focus(); return; }
      location.hash = hashFor('orders', new URLSearchParams({ status: 'all' }));
      setTimeout(() => $('q').focus(), 60);
    }
  });
  // Keep the "5 min ago" labels honest without a full reload
  setInterval(() => { if (me && !document.hidden) render(); }, 60000);
}

bindShell();
bindOrders();
bindSchedule();
bindPeople();
bindTeam();
bindSettings();
bindDrawer();
bindOrderList($('ovAction'));
bindOrderList($('ovToday'));
bindOrderList($('ovOverdue'));
