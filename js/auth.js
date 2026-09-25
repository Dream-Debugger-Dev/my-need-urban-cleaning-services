/* ===============================
   MyNeedUrban — auth.js
   Login / sign-up (phone OTP + email), forgot password, header account state.

   Loaded ONCE per page: the <script> tag and every `import` use the exact
   same URL (including ?v=). A second URL would run this file twice and
   bind every login button twice — two OTP SMS per tap.
   =============================== */

import {
  auth, db,
  RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut,
  doc, setDoc, getDoc, serverTimestamp
} from './firebase-config.js?v=20260924b';

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;
let confirmationResult = null;
let profileUid = null;

// Where to go after logging in, from ?login=1&next=account. Whitelisted so the
// parameter can't be abused as an open redirect.
const NEXT_PAGES = { account: 'pages/account.html', admin: 'pages/admin.html' };
const params = new URLSearchParams(location.search);
let nextAfterLogin = NEXT_PAGES[params.get('next')] || null;

// ─── Auth state + profile ─────────────────────────────────────────────────────
/** Tells other modules (the app shell) who is signed in. */
function publish(user, profile) {
  window._mnuAuthState = { user, profile };
  document.dispatchEvent(new CustomEvent('mnu:auth', { detail: { user, profile } }));
}

/** Stores a profile we already know (just created) without another read. */
function rememberProfile(user, profile) {
  window._userProfile = profile;
  profileUid = user.uid;
  updateHeaderUI(user);
  publish(user, profile);
}

async function loadProfile(user) {
  const ref = doc(db, 'users', user.uid);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
    } catch (e) {
      console.warn('[auth] profile read failed', e?.code || e);
      return null;
    }
    // A brand-new account's profile is written a moment after sign-in.
    await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    window._userProfile = null;
    profileUid = null;
    updateHeaderUI(null);
    publish(null, null);
    return;
  }
  if (profileUid !== user.uid) { window._userProfile = null; profileUid = null; }
  updateHeaderUI(user);
  publish(user, window._userProfile || null);

  const profile = await loadProfile(user);
  if (auth.currentUser?.uid !== user.uid) return;   // signed out meanwhile
  if (profile) { window._userProfile = profile; profileUid = user.uid; }
  updateHeaderUI(user);
  publish(user, window._userProfile || null);
});

/** Creates a customer profile if an older account never got one. */
async function ensureProfile(user) {
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    const profile = { name: user.displayName || '', email: user.email || '', role: 'customer' };
    await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
    rememberProfile(user, profile);
  } catch (e) {
    console.warn('[auth] could not create profile', e?.code || e);
  }
}

// ─── Header UI ────────────────────────────────────────────────────────────────
function updateHeaderUI(user) {
  const loginBtn = document.getElementById('headerLoginBtn');
  const accountBtn = document.getElementById('headerAccountBtn');
  if (!loginBtn || !accountBtn) return;
  if (user) {
    loginBtn.style.display = 'none';
    accountBtn.style.display = 'inline-flex';

    const raw = window._userProfile?.name || user.displayName ||
                user.email || user.phoneNumber || 'Account';
    // An email has no spaces, so split(' ')[0] would return the WHOLE address
    // and push the header past the screen edge. Take the local part for
    // emails, the first word otherwise, then cap the length.
    let label = raw.includes('@') ? raw.split('@')[0] : raw.trim().split(/\s+/)[0];
    if (label.length > 14) label = label.slice(0, 13) + '…';

    // textContent, not innerHTML: the name comes from the user's own profile.
    accountBtn.innerHTML = '<i class="fa-solid fa-circle-user"></i> <span class="acct-label"></span>';
    accountBtn.querySelector('.acct-label').textContent = label;
    accountBtn.title = raw;
  } else {
    loginBtn.style.display = 'inline-flex';
    accountBtn.style.display = 'none';
  }
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('modal-open');
  document.body.style.overflow = '';
}
function closeAllModals() {
  document.querySelectorAll('.mnu-modal').forEach(m => m.classList.remove('modal-open'));
  document.body.style.overflow = '';
}

function initAuthTabs() {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const parent = btn.closest('.auth-tabs-wrap');
      parent.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
      parent.querySelectorAll('.auth-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target)?.classList.add('active');
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AUTH_ERRORS = {
  'auth/invalid-phone-number': "That phone number doesn't look right.",
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/quota-exceeded': 'OTP limit reached for now. Please try again later, or log in with email.',
  'auth/captcha-check-failed': 'Security check failed. Please refresh the page and try again.',
  'auth/invalid-verification-code': 'That OTP is incorrect. Please check and try again.',
  'auth/code-expired': 'That OTP has expired. Tap "Resend OTP".',
  'auth/missing-verification-code': 'Enter the 6-digit OTP.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
  'auth/weak-password': 'Please choose a stronger password (at least 6 characters).',
  'auth/network-request-failed': 'No internet connection. Please check and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact us.',
  'auth/operation-not-allowed': "This login method isn't enabled yet. Please use another option.",
  'auth/billing-not-enabled': "Phone login isn't available right now. Please use email.",
};
const authMessage = (err, fallback) => AUTH_ERRORS[err?.code] || fallback;

/** Disables a button while a request runs, so one tap = one request. */
function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    if (label) btn.textContent = label;
  } else {
    btn.disabled = false;
    if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
  }
}

function setMsg(el, text, ok = false) {
  if (!el) return;
  el.classList.toggle('is-ok', ok);
  el.textContent = text;
}

function afterSignIn() {
  if (nextAfterLogin) location.href = nextAfterLogin;
}

// ─── Phone OTP ────────────────────────────────────────────────────────────────
function setupRecaptcha(btnId) {
  try { window.recaptchaVerifier?.clear(); } catch (_) { /* already cleared */ }
  window.recaptchaVerifier = new RecaptchaVerifier(auth, btnId, { size: 'invisible' });
}

async function sendOtp(phone, btnId, otpSection, errorEl) {
  setMsg(errorEl, '');
  try {
    setupRecaptcha(btnId);
    confirmationResult = await signInWithPhoneNumber(auth, '+91' + phone, window.recaptchaVerifier);
    otpSection.style.display = 'block';
  } catch (err) {
    console.warn('[auth] OTP send failed', err?.code || err);
    setMsg(errorEl, authMessage(err, 'Could not send the OTP. Please try again.'));
    throw err;
  }
}

async function verifyOtp(otp, name, isSignup, errorEl, btn) {
  setMsg(errorEl, '');
  if (!confirmationResult) { setMsg(errorEl, 'Please request an OTP first.'); return; }
  busy(btn, true, 'Verifying…');
  let user;
  try {
    user = (await confirmationResult.confirm(otp)).user;
  } catch (err) {
    busy(btn, false);
    setMsg(errorEl, authMessage(err, 'That OTP is incorrect. Please try again.'));
    return;
  }
  // Signed in. A profile-save problem must not be reported as a wrong OTP.
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = { name: name || '', phone: user.phoneNumber, role: 'customer' };
      await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
      rememberProfile(user, profile);
    } else if (isSignup && name && !snap.data().name) {
      await setDoc(ref, { name }, { merge: true });
      rememberProfile(user, { ...snap.data(), name });
    }
  } catch (err) {
    console.warn('[auth] profile save failed', err?.code || err);
  }
  busy(btn, false);
  closeAllModals();
  showToast(isSignup ? 'Account created! Welcome 🎉' : 'Logged in successfully!');
  afterSignIn();
}

// ─── Email ────────────────────────────────────────────────────────────────────
async function emailLogin(email, password, errorEl, btn) {
  setMsg(errorEl, '');
  busy(btn, true, 'Logging in…');
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    closeAllModals();
    showToast('Logged in successfully!');
    ensureProfile(user);
    afterSignIn();
  } catch (err) {
    setMsg(errorEl, authMessage(err, 'Could not log in. Please try again.'));
  } finally {
    busy(btn, false);
  }
}

async function emailSignup(name, email, password, errorEl, btn) {
  setMsg(errorEl, '');
  busy(btn, true, 'Creating account…');
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const profile = { name, email, role: 'customer' };
      await setDoc(doc(db, 'users', user.uid), { ...profile, createdAt: serverTimestamp() });
      rememberProfile(user, profile);
    } catch (e) {
      console.warn('[auth] profile save failed', e?.code || e);
    }
    closeAllModals();
    showToast('Account created! Welcome 🎉');
    afterSignIn();
  } catch (err) {
    setMsg(errorEl, authMessage(err, 'Could not create your account. Please try again.'));
  } finally {
    busy(btn, false);
  }
}

async function forgotPassword(errorEl, btn) {
  const input = document.getElementById('loginEmail');
  const email = input?.value.trim() || '';
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    setMsg(errorEl, 'Type your email above, then tap "Forgot password?"');
    input?.focus();
    return;
  }
  busy(btn, true, 'Sending…');
  try {
    await sendPasswordResetEmail(auth, email);
    // Worded this way on purpose: Firebase doesn't reveal whether an account exists.
    setMsg(errorEl, `If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`, true);
  } catch (err) {
    setMsg(errorEl, authMessage(err, 'Could not send the reset email. Please try again.'));
  } finally {
    busy(btn, false);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  await signOut(auth);
  window._userProfile = null;
  showToast('Logged out.');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('mnuToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mnuToast';
    document.body.appendChild(t);
  }
  t.setAttribute('role', 'status');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── Wire up DOM ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuthTabs();
  const $ = (id) => document.getElementById(id);

  $('headerLoginBtn')?.addEventListener('click', () => openModal('authModal'));
  $('openSignupLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('authModal');
    openModal('signupModal');
  });
  $('openLoginLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal('signupModal');
    openModal('authModal');
  });
  $('headerAccountBtn')?.addEventListener('click', () => {
    window.location.href = 'pages/account.html';
  });

  // Close buttons and backdrop taps. The booking sheet has its own handlers.
  document.querySelectorAll('.mnu-modal:not(#bookingModal) [data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });
  document.querySelectorAll('.mnu-modal:not(#bookingModal)').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); });
  });

  // Enter in the last field submits, like a normal form
  const enterClicks = (inputId, btnId) =>
    $(inputId)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $(btnId)?.click(); }
    });
  enterClicks('loginPhone', 'loginSendOtpBtn');
  enterClicks('loginOtp', 'loginVerifyBtn');
  enterClicks('loginPassword', 'loginEmailBtn');
  enterClicks('signupOtp', 'signupVerifyBtn');
  enterClicks('signupPassword', 'signupEmailBtn');

  // ── LOGIN ──
  const loginSendOtpBtn = $('loginSendOtpBtn');
  const loginVerifyBtn = $('loginVerifyBtn');
  const loginOtpSection = $('loginOtpSection');
  const loginError = $('loginError');

  loginSendOtpBtn?.addEventListener('click', () => {
    const phone = $('loginPhone').value.replace(/\D/g, '');
    if (!/^\d{10}$/.test(phone)) { setMsg(loginError, 'Enter a valid 10-digit phone number'); return; }
    busy(loginSendOtpBtn, true, 'Sending…');
    sendOtp(phone, 'loginSendOtpBtn', loginOtpSection, loginError).then(() => {
      busy(loginSendOtpBtn, false);
      loginSendOtpBtn.textContent = 'Resend OTP';
      loginVerifyBtn.style.display = 'block';
      $('loginOtp')?.focus();
    }).catch(() => busy(loginSendOtpBtn, false));
  });

  loginVerifyBtn?.addEventListener('click', () => {
    const otp = $('loginOtp').value.trim();
    if (!/^\d{6}$/.test(otp)) { setMsg(loginError, 'Enter the 6-digit OTP'); return; }
    verifyOtp(otp, '', false, loginError, loginVerifyBtn);
  });

  const loginEmailBtn = $('loginEmailBtn');
  loginEmailBtn?.addEventListener('click', () => {
    const email = $('loginEmail').value.trim();
    const pass = $('loginPassword').value;
    const loginError2 = $('loginError2');
    if (!email || !pass) { setMsg(loginError2, 'Fill in email and password'); return; }
    emailLogin(email, pass, loginError2, loginEmailBtn);
  });

  const forgotBtn = $('forgotPwBtn');
  forgotBtn?.addEventListener('click', () => forgotPassword($('loginError2'), forgotBtn));

  // ── SIGN UP ──
  const signupSendOtpBtn = $('signupSendOtpBtn');
  const signupVerifyBtn = $('signupVerifyBtn');
  const signupOtpSection = $('signupOtpSection');
  const signupError = $('signupError');

  signupSendOtpBtn?.addEventListener('click', () => {
    const phone = $('signupPhone').value.replace(/\D/g, '');
    if (!$('signupName').value.trim()) { setMsg(signupError, 'Enter your name'); return; }
    if (!/^\d{10}$/.test(phone)) { setMsg(signupError, 'Enter a valid 10-digit phone number'); return; }
    busy(signupSendOtpBtn, true, 'Sending…');
    sendOtp(phone, 'signupSendOtpBtn', signupOtpSection, signupError).then(() => {
      busy(signupSendOtpBtn, false);
      signupSendOtpBtn.textContent = 'Resend OTP';
      signupVerifyBtn.style.display = 'block';
      $('signupOtp')?.focus();
    }).catch(() => busy(signupSendOtpBtn, false));
  });

  signupVerifyBtn?.addEventListener('click', () => {
    const otp = $('signupOtp').value.trim();
    const name = $('signupName').value.trim();
    if (!name) { setMsg(signupError, 'Enter your name'); return; }
    if (!/^\d{6}$/.test(otp)) { setMsg(signupError, 'Enter the 6-digit OTP'); return; }
    verifyOtp(otp, name, true, signupError, signupVerifyBtn);
  });

  const signupEmailBtn = $('signupEmailBtn');
  signupEmailBtn?.addEventListener('click', () => {
    const name = $('signupEmailName').value.trim();
    const email = $('signupEmail').value.trim();
    const pass = $('signupPassword').value;
    const signupError2 = $('signupError2');
    if (!name || !email || !pass) { setMsg(signupError2, 'Fill in all fields'); return; }
    if (pass.length < 6) { setMsg(signupError2, 'Password must be at least 6 characters'); return; }
    emailSignup(name, email, pass, signupError2, signupEmailBtn);
  });

  $('logoutBtn')?.addEventListener('click', logout);

  // ── ?login=1[&next=account|admin] — sent here by My Bookings / Admin ──
  if (params.get('login') === '1' && $('authModal')) {
    const sub = $('authModalSub');
    if (sub && params.get('next') === 'account') sub.textContent = 'Log in to see your bookings';
    if (sub && params.get('next') === 'admin') sub.textContent = 'Log in with your admin account';
    params.delete('login');
    params.delete('next');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);

    // Already signed in (session restored)? Go straight on instead of asking.
    const off = onAuthStateChanged(auth, (u) => {
      off();
      if (u && nextAfterLogin) location.href = nextAfterLogin;
      else if (!u) openModal('authModal');
    });
  }
});

export { currentUser, openModal, closeModal, showToast, logout };
