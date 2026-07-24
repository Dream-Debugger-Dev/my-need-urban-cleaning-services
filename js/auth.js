/* ===============================
   MyNeedUrban — auth.js
   Firebase Auth: Phone OTP + Email
   =============================== */

import {
  auth, db,
  RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut,
  doc, setDoc, getDoc, serverTimestamp
} from './firebase-config.js';

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;
let confirmationResult = null;

// ─── Auth state listener ──────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateHeaderUI(user);
  if (user) {
    // Load user profile from Firestore
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      window._userProfile = snap.data();
    }
  }
});

// ─── Header UI ────────────────────────────────────────────────────────────────
function updateHeaderUI(user) {
  const loginBtn = document.getElementById('headerLoginBtn');
  const accountBtn = document.getElementById('headerAccountBtn');
  if (!loginBtn || !accountBtn) return;
  if (user) {
    loginBtn.style.display = 'none';
    accountBtn.style.display = 'inline-flex';
    const name = window._userProfile?.name || user.email || user.phoneNumber || 'Account';
    accountBtn.innerHTML = `<i class="fa-solid fa-circle-user"></i> ${name.split(' ')[0]}`;
  } else {
    loginBtn.style.display = 'inline-flex';
    accountBtn.style.display = 'none';
  }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
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

// ─── Tab switching ────────────────────────────────────────────────────────────
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

// ─── reCAPTCHA ────────────────────────────────────────────────────────────────
function setupRecaptcha(btnId) {
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }
  window.recaptchaVerifier = new RecaptchaVerifier(auth, btnId, { size: 'invisible' });
}

// ─── Phone OTP Login ──────────────────────────────────────────────────────────
async function sendOtp(phone, btnId, otpSection, errorEl) {
  try {
    errorEl.textContent = '';
    setupRecaptcha(btnId);
    confirmationResult = await signInWithPhoneNumber(auth, '+91' + phone, window.recaptchaVerifier);
    otpSection.style.display = 'block';
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to send OTP';
    throw err;
  }
}

async function verifyOtp(otp, name, isSignup, errorEl) {
  try {
    errorEl.textContent = '';
    const result = await confirmationResult.confirm(otp);
    const user = result.user;
    // Check/create Firestore profile
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: name || '',
        phone: user.phoneNumber,
        role: 'customer',
        createdAt: serverTimestamp()
      });
    }
    closeAllModals();
    if (isSignup) showToast('Account created! Welcome 🎉');
    else showToast('Logged in successfully!');
  } catch (err) {
    errorEl.textContent = 'Invalid OTP. Please try again.';
  }
}

// ─── Email Login / Signup ─────────────────────────────────────────────────────
async function emailLogin(email, password, errorEl) {
  try {
    errorEl.textContent = '';
    await signInWithEmailAndPassword(auth, email, password);
    closeAllModals();
    showToast('Logged in successfully!');
  } catch (err) {
    errorEl.textContent = 'Invalid email or password.';
  }
}

async function emailSignup(name, email, password, errorEl) {
  try {
    errorEl.textContent = '';
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', result.user.uid), {
      name, email,
      role: 'customer',
      createdAt: serverTimestamp()
    });
    closeAllModals();
    showToast('Account created! Welcome 🎉');
  } catch (err) {
    errorEl.textContent = err.code === 'auth/email-already-in-use'
      ? 'Email already registered. Please login.'
      : err.message;
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  await signOut(auth);
  window._userProfile = null;
  showToast('Logged out.');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('mnuToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mnuToast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Wire up DOM ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuthTabs();

  // Open modals
  document.getElementById('headerLoginBtn')?.addEventListener('click', () => openModal('authModal'));
  document.getElementById('openSignupLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal('signupModal');
    closeModal('authModal');
  });
  document.getElementById('openLoginLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal('authModal');
    closeModal('signupModal');
  });

  // Account button
  document.getElementById('headerAccountBtn')?.addEventListener('click', () => {
    window.location.href = 'pages/account.html';
  });

  // Close modals
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });
  document.querySelectorAll('.mnu-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAllModals();
    });
  });

  // ── LOGIN MODAL ──
  const loginSendOtpBtn = document.getElementById('loginSendOtpBtn');
  const loginVerifyBtn = document.getElementById('loginVerifyBtn');
  const loginEmailBtn = document.getElementById('loginEmailBtn');
  const loginOtpSection = document.getElementById('loginOtpSection');
  const loginError = document.getElementById('loginError');

  loginSendOtpBtn?.addEventListener('click', () => {
    const phone = document.getElementById('loginPhone').value.trim();
    if (phone.length !== 10) { loginError.textContent = 'Enter a valid 10-digit phone number'; return; }
    loginSendOtpBtn.disabled = true;
    loginSendOtpBtn.textContent = 'Sending...';
    sendOtp(phone, 'loginSendOtpBtn', loginOtpSection, loginError).then(() => {
      loginOtpSection.style.display = 'block';
      loginVerifyBtn.style.display = 'block';
      loginSendOtpBtn.textContent = 'Resend OTP';
      loginSendOtpBtn.disabled = false;
    }).catch(() => { loginSendOtpBtn.disabled = false; loginSendOtpBtn.textContent = 'Send OTP'; });
  });

  loginVerifyBtn?.addEventListener('click', () => {
    const otp = document.getElementById('loginOtp').value.trim();
    if (otp.length !== 6) { loginError.textContent = 'Enter the 6-digit OTP'; return; }
    verifyOtp(otp, '', false, loginError);
  });

  loginEmailBtn?.addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const loginError2 = document.getElementById('loginError2');
    if (!email || !pass) { loginError2.textContent = 'Fill in email and password'; return; }
    emailLogin(email, pass, loginError2);
  });

  // ── SIGNUP MODAL ──
  const signupSendOtpBtn = document.getElementById('signupSendOtpBtn');
  const signupVerifyBtn = document.getElementById('signupVerifyBtn');
  const signupEmailBtn = document.getElementById('signupEmailBtn');
  const signupOtpSection = document.getElementById('signupOtpSection');
  const signupError = document.getElementById('signupError');

  signupSendOtpBtn?.addEventListener('click', () => {
    const phone = document.getElementById('signupPhone').value.trim();
    if (phone.length !== 10) { signupError.textContent = 'Enter a valid 10-digit phone number'; return; }
    signupSendOtpBtn.disabled = true;
    signupSendOtpBtn.textContent = 'Sending...';
    sendOtp(phone, 'signupSendOtpBtn', signupOtpSection, signupError).then(() => {
      signupOtpSection.style.display = 'block';
      signupVerifyBtn.style.display = 'block';
      signupSendOtpBtn.textContent = 'Resend OTP';
      signupSendOtpBtn.disabled = false;
    }).catch(() => { signupSendOtpBtn.disabled = false; signupSendOtpBtn.textContent = 'Send OTP'; });
  });

  signupVerifyBtn?.addEventListener('click', () => {
    const otp = document.getElementById('signupOtp').value.trim();
    const name = document.getElementById('signupName').value.trim();
    if (!name) { signupError.textContent = 'Enter your name'; return; }
    if (otp.length !== 6) { signupError.textContent = 'Enter the 6-digit OTP'; return; }
    verifyOtp(otp, name, true, signupError);
  });

  signupEmailBtn?.addEventListener('click', () => {
    const name = document.getElementById('signupEmailName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPassword').value;
    const signupError2 = document.getElementById('signupError2');
    if (!name || !email || !pass) { signupError2.textContent = 'Fill in all fields'; return; }
    if (pass.length < 6) { signupError2.textContent = 'Password must be at least 6 characters'; return; }
    emailSignup(name, email, pass, signupError2);
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
});

export { currentUser, openModal, closeModal, showToast, logout };
