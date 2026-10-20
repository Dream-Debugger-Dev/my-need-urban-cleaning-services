/* ===============================
   MyNeedUrban — account.js
   My Bookings: live booking list with a status tracker, cancel, book again,
   and a profile editor whose details prefill the next booking.

   The bookings query is `where customerId == uid` with NO orderBy: adding an
   orderBy on another field needs a composite index, and without that index
   the old page silently showed "No bookings yet". Sorting happens here.
   =============================== */
import {
  auth, db, onAuthStateChanged, signOut,
  collection, query, where, limit, onSnapshot,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from './firebase-config.js?v=20261020a';
import {
  identity, fmtMobile, mountPhoneVerify, addEmailLogin, sendEmailVerificationLink, refreshIdentity, cancelPhone,
} from './identity.js?v=20261020a';

// Refuse to run inside another website's frame (clickjacking). Same-site frames are fine.
if (window.top !== window.self) {
  let sameSite = false;
  try { sameSite = window.top.location.origin === location.origin; } catch (_) { /* other site */ }
  if (!sameSite) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(location.href); } catch (_) { /* sandboxed frame */ }
    throw new Error('My Bookings cannot be shown inside another website.');
  }
}

const WA = '919613304724';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => Number(n || 0).toLocaleString('en-IN');

const STAGES = [
  { key: 'pending',    label: 'Placed',      icon: 'fa-receipt' },
  { key: 'confirmed',  label: 'Confirmed',   icon: 'fa-circle-check' },
  { key: 'inProgress', label: 'In progress', icon: 'fa-broom' },
  { key: 'completed',  label: 'Completed',   icon: 'fa-flag-checkered' },
];
const LABEL = { pending: 'Placed', confirmed: 'Confirmed', inProgress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const OPEN = new Set(['pending', 'confirmed', 'inProgress']);
const statusOf = (b) => (LABEL[b.status] ? b.status : 'pending');

let user = null;
let profile = null;
let bookings = [];
let tab = 'upcoming';
let unsub = null;
let loaded = false;

// ─── Small helpers ────────────────────────────────────────────────────────────
function show(id) {
  ['acctLoading', 'acctSignedOut', 'acctMain'].forEach((s) => { $(s).hidden = s !== id; });
}

let toastTimer = null;
function toast(msg) {
  const t = $('mnuToast');
  if (!t) return;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

const millis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return Date.parse(ts) || 0;
};

/** Service date: 'YYYY-MM-DD' (website), ISO string (app) or Timestamp. */
function parseDay(s) {
  if (!s) return null;
  if (typeof s.toDate === 'function') return s.toDate();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayLabel(d) {
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - today) / 86400000);
  const base = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today · ${base}`;
  if (diff === 1) return `Tomorrow · ${base}`;
  return base;
}

const digits10 = (v) => String(v || '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
const fmtPhone = (v) => {
  const d = digits10(v);
  return /^\d{10}$/.test(d) ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(v || '');
};
const initials = (s) => {
  const words = String(s || '').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words.length > 1 && !String(s).includes('@') ? words[words.length - 1][0] : '')).toUpperCase() || '🙂';
};

/** Only real Google Maps links are rendered as links (not look-alikes such as maps.google.com.evil.site). */
function safeMaps(link) {
  try {
    const u = new URL(String(link || ''));
    if (u.protocol !== 'https:') return '';
    const ok = u.hostname === 'maps.google.com'
      || ((u.hostname === 'www.google.com' || u.hostname === 'google.com') && u.pathname.startsWith('/maps'));
    return ok ? u.href : '';
  } catch (_) { return ''; }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (u) => {
  unsub?.();
  unsub = null;
  user = u;
  profile = null;
  bookings = [];
  loaded = false;
  openForm = '';
  cancelPhone();
  if (!u) { show('acctSignedOut'); paintIdentity(); return; }

  show('acctMain');
  paintProfile();
  paintIdentity();
  renderList();
  listen();

  getDoc(doc(db, 'users', u.uid)).then((snap) => {
    if (auth.currentUser?.uid !== u.uid) return;
    profile = snap.exists() ? snap.data() : null;
    paintProfile();
  }).catch((e) => console.warn('[account] profile read failed', e?.code || e));
});

function listen() {
  const q = query(collection(db, 'bookings'), where('customerId', '==', user.uid), limit(200));
  unsub = onSnapshot(q, (snap) => {
    loaded = true;
    bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList();
  }, (err) => {
    console.error('[account] bookings failed', err);
    loaded = true;
    renderError(err);
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function paintProfile() {
  const name = profile?.name || user?.displayName || '';
  const phone = profile?.phone || user?.phoneNumber || '';
  const email = profile?.email || user?.email || '';
  $('apName').textContent = name ? `Hi, ${name.trim().split(/\s+/)[0]}` : 'Your account';
  $('apContact').textContent = [phone && fmtPhone(phone), email].filter(Boolean).join(' · ');
  $('apAvatar').textContent = initials(name || email);
}

function formMsg(text, ok = false) {
  $('pfMsg').textContent = text;
  $('pfMsg').style.color = ok ? '#15803d' : '#dc2626';
}

function toggleForm(open) {
  $('apForm').hidden = !open;
  $('apEditBtn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  const authPhone = user?.phoneNumber || '';
  $('pfName').value = profile?.name || user?.displayName || '';
  $('pfPhone').value = digits10(profile?.phone || authPhone);
  // Phone-login customers: the number IS their login, so it isn't editable here.
  $('pfPhone').readOnly = !!authPhone;
  $('pfAlt').value = digits10(profile?.altPhone || '');
  formMsg('');
  $('pfName').focus();
}

$('apEditBtn').addEventListener('click', () => toggleForm($('apForm').hidden));
$('pfCancel').addEventListener('click', () => toggleForm(false));

$('apForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!user) return;
  const name = $('pfName').value.trim();
  const phoneRaw = $('pfPhone').value.trim();
  const phone = digits10(phoneRaw);
  const alt = digits10($('pfAlt').value);
  if (name.length < 2) return formMsg('Please enter your name.');
  if (phoneRaw && !/^\d{10}$/.test(phone)) return formMsg('Mobile number must be 10 digits.');
  if (alt && !/^\d{10}$/.test(alt)) return formMsg('Alternate number must be 10 digits.');
  if (alt && alt === phone) return formMsg('Alternate number must be different from your mobile.');

  const patch = { name: name.slice(0, 60), altPhone: alt, updatedAt: serverTimestamp() };
  if (!user.phoneNumber) patch.phone = phone ? `+91${phone}` : '';
  if (!profile) {
    // First save for an account that never got a profile document
    Object.assign(patch, { role: 'customer', createdAt: serverTimestamp() });
    if (user.email) patch.email = user.email;
    if (user.phoneNumber) patch.phone = user.phoneNumber;
  }

  const btn = $('pfSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await setDoc(doc(db, 'users', user.uid), patch, { merge: true });
    profile = { ...(profile || {}), ...patch };
    paintProfile();
    toggleForm(false);
    toast('Profile saved');
  } catch (err) {
    console.error('[account] profile save failed', err);
    formMsg("Couldn't save your details. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

// ─── Login details: a verified mobile number AND a verified email, on one account ─
// Whichever way a customer first logged in, the other gets added here and verified,
// so either one logs them in to the same bookings. The mobile number is what the
// team calls, so it is needed to book; the email is for updates and as a second way in.
let openForm = '';            // '' | 'phone' | 'email' : which "add" form is open
let emailSentTo = '';         // after a verification link was sent, remember where

const badge = (cls, text) => `<span class="id-badge ${cls}">${esc(text)}</span>`;

function paintIdentity() {
  const card = $('idCard');
  if (!card) return;
  const who = identity();
  card.hidden = !who.signedIn;
  if (!who.signedIn) return;
  const both = !!who.phone && who.emailVerified;
  card.classList.toggle('is-complete', both);
  $('idSub').textContent = both
    ? 'Both are verified. You can log in either way and see the same bookings.'
    : 'Add and verify both, so you can log in either way and we can always reach you.';

  // Mobile. (Left alone while its OTP form is open, so a repaint can't wipe a half-typed code.)
  const phoneBusy = openForm === 'phone' && !who.phone && $('idPhoneSlot')?.dataset.mounted === '1';
  if (!phoneBusy) {
    $('idPhoneRow').innerHTML = `
      <div class="id-line">
        <i class="fa-solid fa-mobile-screen-button id-ic" aria-hidden="true"></i>
        <div class="id-what"><strong>Mobile</strong><span>${who.phone ? esc(fmtMobile(who.phone)) : 'Not added yet'}</span></div>
        ${who.phone
          ? badge('ok', 'Verified')
          : `${badge('warn', 'Needed to book')}<button type="button" class="id-act" data-id="phone">Add &amp; verify</button>`}
      </div>
      <div class="id-slot" id="idPhoneSlot"${openForm === 'phone' && !who.phone ? '' : ' hidden'}></div>`;
  }

  // Email
  let emailLine;
  if (!who.email) {
    emailLine = `${badge('warn', 'Not added')}<button type="button" class="id-act" data-id="email">Add &amp; verify</button>`;
  } else if (!who.emailVerified) {
    emailLine = `${badge('warn', 'Not verified')}<button type="button" class="id-act" data-id="resend">Send link</button>`;
  } else {
    emailLine = badge('ok', 'Verified');
  }
  const waiting = who.email && !who.emailVerified;
  $('idEmailRow').innerHTML = `
    <div class="id-line">
      <i class="fa-regular fa-envelope id-ic" aria-hidden="true"></i>
      <div class="id-what"><strong>Email</strong><span>${who.email ? esc(who.email) : 'Not added yet'}</span></div>
      ${emailLine}
    </div>
    ${waiting ? `<p class="id-note">
        ${emailSentTo ? `We sent a verification link to <strong>${esc(emailSentTo)}</strong>. Open it` : 'Open the verification link in your email'},
        then tap <button type="button" class="id-link" data-id="checked">I've verified</button>.
        Can't find it? Check your spam folder.</p>` : ''}
    <form class="id-form" id="idEmailForm" novalidate${openForm === 'email' && !who.email ? '' : ' hidden'}>
      <label class="ap-field"><span>Email</span>
        <input class="field-input" id="idEmail" type="email" autocomplete="email" maxlength="200" placeholder="you@email.com" /></label>
      <label class="ap-field"><span>Create a password <em>(to log in with this email)</em></span>
        <input class="field-input" id="idPass" type="password" autocomplete="new-password" maxlength="128" /></label>
      <p class="idw-msg" id="idEmailMsg" role="alert" aria-live="polite"></p>
      <div class="ap-form-btns">
        <button type="button" class="btn btn-outline" data-id="cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="idEmailSave">Add &amp; send link</button>
      </div>
    </form>`;

  if (openForm === 'phone' && !who.phone) mountPhoneStep();
}

function mountPhoneStep() {
  const slot = $('idPhoneSlot');
  if (!slot || slot.dataset.mounted === '1') return;
  slot.dataset.mounted = '1';
  mountPhoneVerify(slot, {
    link: true,
    name: profile?.name || user?.displayName || '',
    sendLabel: 'Send OTP',
    verifyLabel: 'Verify mobile number',
    onDone: async (u) => {
      openForm = '';
      profile = { ...(profile || {}), phone: u.phoneNumber };
      await refreshIdentity();
      toast('Mobile number verified ✓');
      paintProfile();
      paintIdentity();
    },
  }).focus();
}

$('idCard')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  const what = b.dataset.id;
  if (what === 'phone' || what === 'email') {
    openForm = what;
    paintIdentity();
    if (what === 'email') $('idEmail')?.focus();
  } else if (what === 'cancel') {
    openForm = '';
    cancelPhone();
    paintIdentity();
  } else if (what === 'resend') {
    b.disabled = true;
    const r = await sendEmailVerificationLink();
    toast(r.ok ? `Verification link sent to ${r.email || identity().email}` : r.message);
    if (r.ok) emailSentTo = r.email || identity().email;
    paintIdentity();
  } else if (what === 'checked') {
    const was = identity().emailVerified;
    const now = await refreshIdentity();
    if (now.emailVerified && !was) toast('Email verified ✓');
    else if (!now.emailVerified) toast("Not verified yet. Open the link in your email first, then try again.");
    paintIdentity();
  }
});

$('idCard')?.addEventListener('submit', async (e) => {
  if (e.target.id !== 'idEmailForm') return;
  e.preventDefault();
  const msg = $('idEmailMsg');
  const btn = $('idEmailSave');
  msg.textContent = '';
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = 'Adding…';
  const r = await addEmailLogin($('idEmail').value, $('idPass').value, { name: profile?.name || '' });
  btn.disabled = false;
  btn.innerHTML = label;
  if (!r.ok) { msg.textContent = r.message; return; }
  openForm = '';
  emailSentTo = r.email;
  profile = { ...(profile || {}), email: r.email };
  toast(r.sent ? `Verification link sent to ${r.email}` : 'Email added. Tap "Send link" to verify it.');
  paintProfile();
  paintIdentity();
});

// Coming back from the verification email in another tab: pick up the change by itself
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !user) return;
  const was = identity();
  if (!was.email || was.emailVerified) return;
  const now = await refreshIdentity();
  if (now.emailVerified) { toast('Email verified ✓'); paintIdentity(); }
});

// ─── The booking, as a WhatsApp message ───────────────────────────────────────
/**
 * The booking's details as a WhatsApp message to the team, built from what was
 * saved. (Customers send it from here, not from the booking sheet.)
 */
function waDetails(b) {
  const SEP = '- - - - - - - - - - - - - - -';
  const qty = Number(b.quantity) || 1;
  const L = ['*BOOKING DETAILS*', '_MyNeedUrban Cleaning Services_', SEP, ''];
  if (b.orderId) L.push(`*Order ID: ${b.orderId}*`, '');

  L.push('*SERVICE*', b.servicePath || b.serviceName || 'Cleaning service');
  if (b.enquiredVia) L.push(`_(enquired via "${b.enquiredVia}")_`);
  if (b.venueType) L.push(`*Venue type:* ${b.venueType}`);
  L.push('');

  L.push('*PRICING*');
  if (Number(b.amount) > 0) {
    if (qty > 1) L.push(`Quantity: ${qty}`);
    L.push(`*Total: ₹${inr(b.amount)}*${qty === 1 && b.priceUnit ? ` (${b.priceUnit})` : ''}`);
    L.push('_Pay after the service is completed._');
  } else {
    L.push('Custom price — to be confirmed');
  }
  L.push('');

  const address = String(b.address || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  L.push('*SERVICE ADDRESS*');
  if (address.length) L.push(...address); else L.push('(not provided)');
  const gps = b.geo && Number.isFinite(+b.geo.lat) && Number.isFinite(+b.geo.lng) ? `${+b.geo.lat}, ${+b.geo.lng}` : '';
  if (gps) L.push(`GPS: ${gps} _(shared by customer)_`);
  const maps = safeMaps(b.mapsLink);
  if (maps) L.push('', '*NAVIGATE*', maps);
  L.push('');

  const notes = String(b.notes || '').trim();
  if (notes) { L.push(b.pricingType === 'fixed' ? '*CUSTOMER NOTES*' : '*REQUIREMENT DETAILS*', ...notes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), ''); }

  const day = parseDay(b.scheduledDate);
  if (day) L.push('*PREFERRED DATE*', day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), '');

  const phone = digits10(b.customerPhone);
  const alt = digits10(b.customerAltPhone);
  L.push('*CONTACT DETAILS*', `Name: ${b.customerName || '(not provided)'}`, `Phone: ${phone ? `+91 ${phone}` : '(not provided)'}`);
  if (alt) L.push(`Alt Phone: +91 ${alt}`);
  if (b.customerEmail) L.push(`Email: ${b.customerEmail}`);
  L.push('', SEP, '_Sent from myneedurban.com_');
  return L.join('\n');
}

// ─── Bookings list ────────────────────────────────────────────────────────────
const dayKey = (b) => parseDay(b.scheduledDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;

function renderList() {
  const open = bookings.filter((b) => OPEN.has(statusOf(b)));
  const past = bookings.filter((b) => !OPEN.has(statusOf(b)));
  // Upcoming: soonest service date first; Past: most recent first
  open.sort((a, b) => (dayKey(a) - dayKey(b)) || (millis(b.createdAt) - millis(a.createdAt)));
  past.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

  $('cntUpcoming').textContent = open.length;
  $('cntPast').textContent = past.length;
  paintStats(open, past);

  const list = $('acctList');
  if (!loaded) {
    list.innerHTML = '<div class="acct-skel"></div><div class="acct-skel"></div>';
    return;
  }
  const items = tab === 'upcoming' ? open : past;
  list.innerHTML = items.length ? items.map(card).join('') : emptyState(past.length);
}

function paintStats(open, past) {
  const done = past.filter((b) => statusOf(b) === 'completed');
  const saved = done.reduce((s, b) => {
    const mrp = Number(b.mrp) * (Number(b.quantity) || 1);
    return s + (mrp > Number(b.amount) ? mrp - Number(b.amount) : 0);
  }, 0);
  const stat = (n, label) => `<div class="as-card"><strong>${esc(n)}</strong><small>${esc(label)}</small></div>`;
  $('acctStats').innerHTML = [
    stat(open.length, 'Upcoming'),
    stat(done.length, 'Completed'),
    saved > 0 ? stat(`₹${inr(saved)}`, 'Saved vs MRP') : stat(bookings.length, 'All bookings'),
  ].join('');
}

function emptyState(pastCount) {
  if (tab === 'past') {
    return `<div class="acct-none"><i class="fa-regular fa-folder-open"></i>
      <p>No past bookings yet</p><small>Completed and cancelled bookings will show here.</small></div>`;
  }
  return `<div class="acct-none"><i class="fa-regular fa-calendar"></i>
    <p>${pastCount ? 'Nothing scheduled right now' : 'No bookings yet'}</p>
    <small>${pastCount ? 'Ready for your next clean?' : 'Book in a minute — see the price upfront and pay after service.'}</small>
    <a class="btn btn-primary" href="../index.html?book=root"><i class="fa-solid fa-calendar-check"></i> Book Service</a></div>`;
}

function card(b) {
  const st = statusOf(b);
  const idx = STAGES.findIndex((s) => s.key === st);
  const day = dayLabel(parseDay(b.scheduledDate));
  const placedMs = millis(b.createdAt);
  const placed = placedMs
    ? new Date(placedMs).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
  const amount = Number(b.amount) > 0
    ? `₹${inr(b.amount)}`
    : (b.channel === 'callback' ? 'Call-back request' : 'Price after visit');
  const path = b.servicePath && b.servicePath !== b.serviceName ? b.servicePath : '';
  const address = String(b.address || '').split('\n')[0];
  const maps = safeMaps(b.mapsLink);
  const oid = b.orderId || '';
  const help = `https://wa.me/${WA}?text=${encodeURIComponent(
    `Hi MyNeedUrban, I have a question about my booking ${oid} (${b.serviceName || 'cleaning'}).`)}`;
  const sendDetails = `https://wa.me/${WA}?text=${encodeURIComponent(waDetails(b))}`;
  const rebookId = b.serviceId && b.serviceId !== 'callback' ? b.serviceId : 'root';

  const tracker = st === 'cancelled'
    ? '<div class="bk-cancelled"><i class="fa-solid fa-ban"></i> This booking was cancelled</div>'
    : `<ol class="bk-track" aria-label="Booking progress: ${LABEL[st]}">${STAGES.map((s, i) => `
        <li class="bt-step${i < idx ? ' done' : ''}${i === idx ? ' current' : ''}">
          <span class="bt-dot"><i class="fa-solid ${i < idx ? 'fa-check' : s.icon}" aria-hidden="true"></i></span>
          <span class="bt-label">${s.label}</span>
        </li>`).join('')}</ol>`;

  return `
  <article class="bk-card st-${st}">
    <header class="bk-head">
      <div class="bk-title">
        <strong>${esc(b.serviceName || 'Cleaning service')}</strong>
        ${path ? `<small>${esc(path)}</small>` : ''}
      </div>
      <span class="bk-status s-${st}">${LABEL[st]}</span>
    </header>
    ${tracker}
    <dl class="bk-meta">
      <div><dt><i class="fa-regular fa-calendar" aria-hidden="true"></i> Date</dt><dd>${esc(day || 'To be confirmed')}${b.timeSlot ? ` · ${esc(b.timeSlot)}` : ''}</dd></div>
      <div><dt><i class="fa-solid fa-indian-rupee-sign" aria-hidden="true"></i> Price</dt><dd>${esc(amount)}${Number(b.quantity) > 1 ? ` · qty ${Number(b.quantity)}` : ''}</dd></div>
      ${address ? `<div class="wide"><dt><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Address</dt><dd>${esc(address)}</dd></div>` : ''}
    </dl>
    <div class="bk-order">
      ${oid ? `<button type="button" class="bk-oid" data-copy="${esc(oid)}" aria-label="Copy order ID ${esc(oid)}"><i class="fa-regular fa-copy" aria-hidden="true"></i> ${esc(oid)}</button>` : ''}
      ${placed ? `<span>Placed ${esc(placed)}</span>` : ''}
    </div>
    <div class="bk-actions">
      ${OPEN.has(st) ? `<a class="bk-btn bk-wa" href="${sendDetails}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Send details on WhatsApp</a>` : ''}
      <a class="bk-btn" href="${help}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Get help</a>
      ${maps ? `<a class="bk-btn" href="${esc(maps)}" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Location</a>` : ''}
      ${OPEN.has(st) ? '' : `<a class="bk-btn" href="../index.html?book=${encodeURIComponent(rebookId)}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Book again</a>`}
      ${st === 'pending' ? `<button type="button" class="bk-btn bk-danger" data-cancel="${esc(b.id)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancel</button>` : ''}
    </div>
  </article>`;
}

function renderError(err) {
  const denied = err?.code === 'permission-denied';
  $('acctList').innerHTML = `
    <div class="acct-none acct-err"><i class="fa-solid fa-triangle-exclamation"></i>
      <p>${denied ? 'Please log in again' : "We couldn't load your bookings"}</p>
      <small>${denied ? 'Your session has expired or changed.' : 'Check your internet connection and try again.'}</small>
      <button type="button" class="btn btn-outline" id="retryBtn">Try again</button>
    </div>`;
  $('retryBtn').addEventListener('click', () => {
    unsub?.();
    loaded = false;
    renderList();
    listen();
  });
}

// ─── Interactions ─────────────────────────────────────────────────────────────
document.querySelectorAll('.acct-tab').forEach((t) => {
  t.addEventListener('click', () => {
    tab = t.dataset.tab;
    document.querySelectorAll('.acct-tab').forEach((x) => {
      const on = x === t;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-selected', String(on));
    });
    renderList();
  });
});

$('acctList').addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Order ID copied'); }
    catch { toast(copy.dataset.copy); }
    return;
  }
  const cancel = e.target.closest('[data-cancel]');
  if (!cancel) return;
  const b = bookings.find((x) => x.id === cancel.dataset.cancel);
  if (!b) return;
  if (!confirm(`Cancel your ${b.serviceName || 'booking'}${b.orderId ? ` (${b.orderId})` : ''}?\n\nThis can't be undone.`)) return;
  cancel.disabled = true;
  try {
    // Status only: that is exactly what the security rules allow a customer to change.
    await updateDoc(doc(db, 'bookings', b.id), { status: 'cancelled' });
    toast('Booking cancelled');
  } catch (err) {
    console.error('[account] cancel failed', err);
    cancel.disabled = false;
    toast("Couldn't cancel online — please call or WhatsApp us.");
  }
});

$('signOutBtn').addEventListener('click', async () => {
  await signOut(auth);
  location.href = '../index.html';
});
