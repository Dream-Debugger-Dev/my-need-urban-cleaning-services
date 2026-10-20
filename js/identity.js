/* ===============================
   MyNeedUrban — identity.js
   One account, two verified ways in: a mobile number (OTP) and an email.

   - A customer who signs in with their NUMBER is asked to add and verify an
     EMAIL; one who signs in with an EMAIL must add and verify a NUMBER (the
     number is what the team calls, so a booking needs it).
   - Both end up on the SAME account (Firebase "linking"), so either one logs
     the customer in to the same bookings.
   - Used by the booking sheet (booking.js) and My Bookings (account.js).

   Every function returns { ok, message?, ... } and never throws, so the screens
   just show `message`. The guards in auth-guard.js (OTP/password lockouts,
   SMS spacing) apply here exactly as they do in the login sheet.

   Import as './identity.js?v=<same version as the HTML>' (one copy per page).
   =============================== */
import {
  auth, db,
  RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber, linkWithCredential,
  EmailAuthProvider, sendEmailVerification, signInWithEmailAndPassword,
  doc, getDoc, setDoc, serverTimestamp,
} from './firebase-config.js?v=20261020a';
import {
  waitFor, failed, succeeded, smsWait, smsSent, inWords, countdown, passwordProblem,
} from './auth-guard.js?v=20261020a';

const SITE = new URL('../', import.meta.url);        // site root (this file is /js/identity.js)

// ─── Small helpers ────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "98765 43210" / "+91 98765 43210" / "09876543210" → "9876543210" ('' if it isn't an Indian mobile). */
export function mobile10(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}
export const fmtMobile = (e164) => {
  const d = mobile10(e164);
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(e164 || '');
};
const EMAIL_OK = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
export const isEmail = (v) => typeof v === 'string' && v.length <= 200 && EMAIL_OK.test(v);

const MESSAGES = {
  'auth/invalid-phone-number': "That mobile number doesn't look right.",
  'auth/too-many-requests': 'Too many attempts. For your safety, please wait a while and try again.',
  'auth/quota-exceeded': 'OTP limit reached for now. Please try again later.',
  'auth/captcha-check-failed': 'Security check failed. Please refresh the page and try again.',
  'auth/invalid-app-credential': 'Security check failed. Please refresh the page and try again.',
  'auth/invalid-verification-code': 'That OTP is incorrect. Please check and try again.',
  'auth/code-expired': 'That OTP has expired. Tap "Resend OTP".',
  'auth/missing-verification-code': 'Enter the 6-digit OTP.',
  'auth/network-request-failed': 'No internet connection. Please check and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact us.',
  'auth/operation-not-allowed': "This login method isn't enabled yet. Please try another option.",
  'auth/billing-not-enabled': "Phone verification isn't available right now. Please call us to book.",
  'auth/credential-already-in-use': 'That number already belongs to another account. Log in with that number instead.',
  'auth/account-exists-with-different-credential': 'That number already belongs to another account. Log in with that number instead.',
  'auth/provider-already-linked': 'A mobile number is already linked to this account.',
  'auth/email-already-in-use': 'That email already belongs to another account. Log in with that email instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Please choose a stronger password: at least 8 characters, mixing letters and numbers.',
  'auth/password-does-not-meet-requirements': 'Please choose a stronger password: at least 8 characters, mixing letters and numbers.',
  'auth/requires-recent-login': 'For your safety, please log out and log in again, then try once more.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
};
const WRONG_LOGIN = new Set(['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found']);
const say = (err, fallback) => MESSAGES[err?.code] || fallback;

/** What this account has: { signedIn, uid, phone, email, emailVerified, hasPassword }. */
export function identity(user = auth.currentUser) {
  if (!user) return { signedIn: false, uid: '', phone: '', email: '', emailVerified: false, hasPassword: false };
  const ids = (user.providerData || []).map((p) => p.providerId);
  return {
    signedIn: true,
    uid: user.uid,
    phone: user.phoneNumber || '',                       // only ever set after an OTP
    email: user.email || '',
    emailVerified: !!user.email && !!user.emailVerified,
    hasPassword: ids.includes('password'),
  };
}

/** Saves a few harmless profile fields (works whether or not a profile exists yet). */
async function remember(user, fields) {
  try {
    await setDoc(doc(db, 'users', user.uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[identity] profile save failed', e?.code || e);
  }
}

// ─── Phone: sign in, or add a number to the account you are on ────────────────
// Invisible reCAPTCHA can be drawn into an element only ONCE, so every OTP request
// gets a brand-new element (the same fix as the login sheet). Its own host id keeps
// it apart from the login sheet's reCAPTCHA.
let verifier = null;
let pending = null;          // { confirmation, link, phone10 }

function clearRecaptcha() {
  try { verifier?.clear(); } catch (_) { /* already gone */ }
  verifier = null;
  const host = document.getElementById('mnuIdentityCaptcha');
  if (host) host.textContent = '';
}
function newVerifier() {
  clearRecaptcha();
  let host = document.getElementById('mnuIdentityCaptcha');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mnuIdentityCaptcha';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  host.appendChild(el);
  verifier = new RecaptchaVerifier(auth, el, { size: 'invisible' });
  return verifier;
}

/** Forgets any half-finished OTP (call when a screen is closed). */
export function cancelPhone() {
  pending = null;
  clearRecaptcha();
}

/**
 * Texts a 6-digit code to a mobile number.
 * `link: true` adds the number to the account that is signed in (an email
 * account); otherwise the code signs the customer in (or creates the account).
 */
export async function sendPhoneCode(phone, { link = false } = {}) {
  const p10 = mobile10(phone);
  if (!p10) return { ok: false, message: 'Enter a valid 10-digit mobile number.' };
  if (link && !auth.currentUser) return { ok: false, message: 'Please log in first.' };
  const locked = waitFor('otp');
  if (locked) return { ok: false, wait: locked, message: `Too many wrong OTPs. For safety, please try again in ${inWords(locked)}.` };
  const wait = smsWait();
  if (wait) return { ok: false, wait, message: `Please wait ${inWords(wait)} before asking for another OTP.` };
  try {
    const confirmation = link
      ? await linkWithPhoneNumber(auth.currentUser, `+91${p10}`, newVerifier())
      : await signInWithPhoneNumber(auth, `+91${p10}`, newVerifier());
    smsSent();
    pending = { confirmation, link, phone10: p10 };
    return { ok: true, phone10: p10 };
  } catch (err) {
    console.warn('[identity] OTP send failed', err?.code || err);
    clearRecaptcha();
    return { ok: false, message: say(err, 'Could not send the OTP. Please try again.') };
  }
}

/** Checks the 6-digit code. On success the number is verified and on the account. */
export async function confirmPhoneCode(code, { name = '' } = {}) {
  if (!pending) return { ok: false, message: 'Please request an OTP first.' };
  const otp = String(code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(otp)) return { ok: false, message: 'Enter the 6-digit OTP.' };
  const locked = waitFor('otp');
  if (locked) return { ok: false, message: `Too many wrong OTPs. Please try again in ${inWords(locked)}.` };
  const { confirmation, link } = pending;
  let user;
  try {
    user = (await confirmation.confirm(otp)).user;
    succeeded('otp');
    pending = null;
    clearRecaptcha();
  } catch (err) {
    if (err?.code === 'auth/invalid-verification-code' && failed('otp')) {
      pending = null;                        // that code is burnt; ask for a fresh one
      return { ok: false, burnt: true, message: `Too many wrong OTPs. Please request a new OTP in ${inWords(waitFor('otp'))}.` };
    }
    if (err?.code === 'auth/code-expired') pending = null;
    return { ok: false, message: say(err, 'That OTP is incorrect. Please try again.') };
  }

  // Signed in or linked. A profile problem must never be reported as a wrong OTP.
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: name || user.displayName || '', phone: user.phoneNumber, role: 'customer',
        ...(user.email ? { email: user.email } : {}), createdAt: serverTimestamp(),
      });
    } else {
      const patch = {};
      if (link || !snap.data().phone) patch.phone = user.phoneNumber;
      if (name && !snap.data().name) patch.name = name;
      if (Object.keys(patch).length) await remember(user, patch);
    }
  } catch (e) {
    console.warn('[identity] profile save failed', e?.code || e);
  }
  return { ok: true, user, linked: link };
}

// ─── Email: log in, add one to a phone account, verify it ─────────────────────
/** Logs in with email + password (with the same wrong-password lockout as the login sheet). */
export async function loginWithEmail(email, password) {
  const mail = String(email || '').trim();
  if (!isEmail(mail) || !password) return { ok: false, message: 'Fill in your email and password.' };
  const locked = waitFor('password');
  if (locked) return { ok: false, message: `Too many wrong attempts. For your safety, please wait ${inWords(locked)}.` };
  try {
    const { user } = await signInWithEmailAndPassword(auth, mail, password);
    succeeded('password');
    try {
      const ref = doc(db, 'users', user.uid);
      if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, { name: user.displayName || '', email: user.email || mail, role: 'customer', createdAt: serverTimestamp() });
      }
    } catch (e) { console.warn('[identity] profile check failed', e?.code || e); }
    return { ok: true, user };
  } catch (err) {
    const lock = WRONG_LOGIN.has(err?.code) ? failed('password') : 0;
    return { ok: false, message: lock
      ? `Too many wrong attempts. For your safety, please wait ${inWords(lock)}.`
      : say(err, 'Could not log in. Please try again.') };
  }
}

const VERIFY_GAP = 60000;
const lastVerifyAt = () => Number(localStorage.getItem('mnu-verify-sent') || 0);

/** Sends (or re-sends) the "verify your email" link. One a minute from this browser. */
export async function sendEmailVerificationLink() {
  const user = auth.currentUser;
  if (!user?.email) return { ok: false, message: 'Add your email first.' };
  if (user.emailVerified) return { ok: true, already: true };
  const wait = Math.ceil((lastVerifyAt() + VERIFY_GAP - Date.now()) / 1000);
  if (wait > 0) return { ok: false, wait, message: `A link was just sent. You can ask for another in ${inWords(wait)}.` };
  try {
    await sendEmailVerification(user, { url: new URL('pages/account.html', SITE).href });
    try { localStorage.setItem('mnu-verify-sent', String(Date.now())); } catch (_) { /* private mode */ }
    return { ok: true, email: user.email };
  } catch (err) {
    console.warn('[identity] verification email failed', err?.code || err);
    return { ok: false, message: say(err, "Couldn't send the verification link. Please try again in a minute.") };
  }
}

/**
 * Adds an email (and a password to log in with it) to the signed-in account,
 * then sends the verification link. The email counts as verified only after the
 * customer taps that link.
 */
export async function addEmailLogin(email, password, { name = '' } = {}) {
  const user = auth.currentUser;
  if (!user) return { ok: false, message: 'Please log in first.' };
  const mail = String(email || '').trim();
  if (!isEmail(mail)) return { ok: false, message: 'Please enter a valid email address.' };
  const weak = passwordProblem(password, { email: mail, name });
  if (weak) return { ok: false, message: weak };
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(mail, password));
  } catch (err) {
    console.warn('[identity] email link failed', err?.code || err);
    return { ok: false, message: say(err, 'Could not add that email. Please try again.') };
  }
  await remember(auth.currentUser || user, { email: mail });
  const sent = await sendEmailVerificationLink();
  return { ok: true, email: mail, sent: sent.ok, message: sent.ok ? '' : sent.message };
}

/** Re-reads the account from Firebase (after the customer taps the verification link). */
export async function refreshIdentity() {
  const user = auth.currentUser;
  if (user) {
    try { await user.reload(); } catch (e) { console.warn('[identity] reload failed', e?.code || e); }
  }
  return identity(auth.currentUser);
}

// ─── Ready-made screens ───────────────────────────────────────────────────────
const msgSet = (el, text, ok = false) => {
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('is-ok', !!ok);
};

/**
 * Draws the "verify your mobile number" form into `host` and wires it.
 *   link      add the number to the signed-in account (instead of signing in)
 *   phone     number to start with
 *   name      saved on a brand-new profile
 *   sendLabel / verifyLabel   button texts
 *   onDone(user)              called once the number is verified
 */
export function mountPhoneVerify(host, { link = false, phone = '', name = '', sendLabel = 'Send OTP', verifyLabel = 'Verify', onDone } = {}) {
  host.innerHTML = `
    <div class="idw">
      <label class="idw-label" for="idwPhone">Mobile number</label>
      <div class="idw-phone">
        <span class="idw-cc" aria-hidden="true">+91</span>
        <input class="field-input" id="idwPhone" type="tel" inputmode="numeric" maxlength="14"
               autocomplete="tel-national" placeholder="10-digit mobile" value="${esc(mobile10(phone))}" />
      </div>
      <button type="button" class="btn btn-primary idw-btn" data-idw="send">${esc(sendLabel)}</button>
      <div class="idw-otp" hidden>
        <label class="idw-label" for="idwOtp" data-idw="otpLabel">6-digit OTP</label>
        <input class="field-input idw-code" id="idwOtp" type="text" inputmode="numeric"
               autocomplete="one-time-code" maxlength="6" placeholder="• • • • • •" />
        <button type="button" class="btn btn-primary idw-btn" data-idw="verify">${esc(verifyLabel)}</button>
        <div class="idw-links">
          <button type="button" class="idw-link" data-idw="resend">Resend OTP</button>
          <button type="button" class="idw-link" data-idw="change">Use a different number</button>
        </div>
      </div>
      <p class="idw-msg" role="alert" aria-live="polite"></p>
    </div>`;
  const $ = (k) => host.querySelector(`[data-idw="${k}"]`);
  const phoneEl = host.querySelector('#idwPhone');
  const otpEl = host.querySelector('#idwOtp');
  const msg = host.querySelector('.idw-msg');
  const section = host.querySelector('.idw-otp');
  const sendBtn = $('send');
  const verifyBtn = $('verify');

  const toPhoneStep = () => {
    section.hidden = true;
    phoneEl.readOnly = false;
    sendBtn.hidden = false;
    sendBtn.disabled = false;
    sendBtn.textContent = sendLabel;
    cancelPhone();
  };

  async function send(btn) {
    msgSet(msg, '');
    const p10 = mobile10(phoneEl.value);
    if (!p10) { msgSet(msg, 'Enter a valid 10-digit mobile number.'); phoneEl.focus(); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Sending…';
    const r = await sendPhoneCode(p10, { link });
    btn.textContent = label;
    if (!r.ok) {
      msgSet(msg, r.message);
      btn.disabled = false;
      if (r.wait && !section.hidden) countdown($('resend'), r.wait, 'Resend OTP', (s) => `Resend OTP in ${s}s`);
      return;
    }
    phoneEl.readOnly = true;
    sendBtn.hidden = true;
    section.hidden = false;
    $('otpLabel').textContent = `6-digit OTP sent to +91 ${p10.slice(0, 5)} ${p10.slice(5)}`;
    msgSet(msg, 'OTP sent. It can take up to a minute to arrive.', true);
    otpEl.value = '';
    otpEl.focus();
    countdown($('resend'), smsWait(), 'Resend OTP', (s) => `Resend OTP in ${s}s`);
  }

  async function verify() {
    msgSet(msg, '');
    verifyBtn.disabled = true;
    const label = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying…';
    const r = await confirmPhoneCode(otpEl.value, { name });
    verifyBtn.textContent = label;
    verifyBtn.disabled = false;
    if (!r.ok) {
      msgSet(msg, r.message);
      if (r.burnt) toPhoneStep();
      else otpEl.focus();
      return;
    }
    verifyBtn.disabled = true;
    msgSet(msg, 'Mobile number verified ✓', true);
    onDone?.(r.user);
  }

  sendBtn.addEventListener('click', () => send(sendBtn));
  $('resend').addEventListener('click', () => send($('resend')));
  $('change').addEventListener('click', () => { msgSet(msg, ''); toPhoneStep(); phoneEl.focus(); });
  verifyBtn.addEventListener('click', verify);
  phoneEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!sendBtn.hidden) sendBtn.click(); } });
  otpEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); } });
  return { focus: () => phoneEl.focus(), destroy: () => { cancelPhone(); host.innerHTML = ''; } };
}

/** Draws "log in with email" into `host`. onDone(user) once logged in. */
export function mountEmailLogin(host, { email = '', loginLabel = 'Log in', onDone } = {}) {
  host.innerHTML = `
    <div class="idw">
      <label class="idw-label" for="idwEmail">Email</label>
      <input class="field-input" id="idwEmail" type="email" autocomplete="email" maxlength="200" value="${esc(email)}" placeholder="you@email.com" />
      <label class="idw-label" for="idwPass">Password</label>
      <input class="field-input" id="idwPass" type="password" autocomplete="current-password" maxlength="128" />
      <button type="button" class="btn btn-primary idw-btn" data-idw="login">${esc(loginLabel)}</button>
      <p class="idw-msg" role="alert" aria-live="polite"></p>
    </div>`;
  const msg = host.querySelector('.idw-msg');
  const btn = host.querySelector('[data-idw="login"]');
  const go = async () => {
    msgSet(msg, '');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Logging in…';
    const r = await loginWithEmail(host.querySelector('#idwEmail').value, host.querySelector('#idwPass').value);
    btn.textContent = label;
    btn.disabled = false;
    if (!r.ok) { msgSet(msg, r.message); return; }
    onDone?.(r.user);
  };
  btn.addEventListener('click', go);
  host.querySelector('#idwPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return { focus: () => host.querySelector('#idwEmail').focus() };
}
