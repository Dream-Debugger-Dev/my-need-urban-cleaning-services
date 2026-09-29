/* ===============================
   MyNeedUrban — auth-guard.js
   Friction against guessing, used by the login sheet (auth.js) and the
   staff sign-in (admin.js):

   - Wrong password or wrong OTP: 5 free tries, then a growing wait in this
     browser (30 s, 1 min, 2 min … up to 15 min).
   - OTP texts: at least 30 s apart and at most 3 per 15 minutes, so the
     buttons can't be used to flood a phone (or our SMS bill).
   - New passwords: at least 8 characters, not common, not only numbers.

   This is the visible layer. The hard limits live on the server: Firebase
   locks an account or device after repeated failures (auth/too-many-requests)
   and rate-limits SMS, and the database rules decide who sees what.

   Import as './auth-guard.js?v=<same version as the HTML>'.
   =============================== */

const KEY = 'mnu-auth-guard';
const MIN = 60000;
const WINDOW = 15 * MIN;   // a failure is forgotten after 15 quiet minutes
const FREE_TRIES = 5;
const SMS_GAP = 30000;
const SMS_MAX = 3;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* private mode / storage full */ }
}

/** Seconds until `kind` may be tried again (0 = go ahead). */
export function waitFor(kind) {
  const until = load()[kind]?.until || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/** Records one failed attempt. Returns the seconds to wait now (0 if none). */
export function failed(kind) {
  const s = load();
  const now = Date.now();
  const g = s[kind] && now - (s[kind].last || 0) < WINDOW ? s[kind] : { n: 0 };
  g.n += 1;
  g.last = now;
  if (g.n >= FREE_TRIES) g.until = now + Math.min(WINDOW, 30000 * 2 ** (g.n - FREE_TRIES));
  s[kind] = g;
  save(s);
  return waitFor(kind);
}

/** Forgets the failures after a successful sign-in. */
export function succeeded(kind) {
  const s = load();
  delete s[kind];
  save(s);
}

/** Seconds before this browser may request another OTP text (0 = now). */
export function smsWait() {
  const now = Date.now();
  const sent = (load().sms || []).filter((t) => now - t < WINDOW);
  const lastAt = sent[sent.length - 1];
  if (lastAt && now - lastAt < SMS_GAP) return Math.ceil((SMS_GAP - (now - lastAt)) / 1000);
  if (sent.length >= SMS_MAX) return Math.ceil((WINDOW - (now - sent[0])) / 1000);
  return 0;
}

/** Records that an OTP text was sent. */
export function smsSent() {
  const s = load();
  const now = Date.now();
  s.sms = (s.sms || []).filter((t) => now - t < WINDOW).concat(now);
  save(s);
}

/** 45 → "45 seconds", 150 → "3 minutes". */
export function inWords(sec) {
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const m = Math.ceil(sec / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

/** Keeps a button disabled for `sec` seconds with a live count, then restores `label`. */
export function countdown(btn, sec, label, during = (s) => `${label} (${s}s)`) {
  if (!btn) return;
  clearInterval(btn._mnuCountdown);
  const end = Date.now() + sec * 1000;
  const tick = () => {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = during(left);
      return;
    }
    clearInterval(btn._mnuCountdown);
    btn.disabled = false;
    btn.textContent = label;
  };
  tick();
  btn._mnuCountdown = setInterval(tick, 1000);
}

// The most-guessed passwords, plus the obvious ones for this site.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'pass@123', 'pass1234',
  'qwerty12', 'qwerty123', 'qwertyuiop', 'qwerty@123', 'asdfghjk', 'asdf1234', 'zxcvbnm1',
  'abc12345', 'abcd1234', 'abcd@1234', 'abc@1234', 'a1b2c3d4', 'aa123456', 'admin123', 'admin@123',
  'welcome1', 'welcome123', 'welcome@123', 'iloveyou', 'iloveyou1', 'letmein1', 'sunshine1',
  'princess1', 'football1', 'monkey123', 'dragon123', 'test@123', 'test1234', 'india123',
  'india@123', 'hyderabad', 'hyderabad1', 'myneedurban', 'myneedurban1', 'myneedurban123',
]);

/** What's wrong with a new password ('' = fine). */
export function passwordProblem(pass, { email = '', name = '' } = {}) {
  const p = String(pass || '');
  if (p.length < 8) return 'Use at least 8 characters for your password.';
  if (p.length > 128) return 'That password is too long (128 characters at most).';
  if (/^\d+$/.test(p)) return "Don't use only numbers — a phone number or date is easy to guess.";
  const sameChar = /^(.)\1+$/.test(p);
  const shortRun = p.length < 10 && /^(?:0123|1234|2345|3456|4567|5678|6789|abcd)/i.test(p);
  if (sameChar || shortRun) return 'That password is too easy to guess.';
  const low = p.toLowerCase();
  if (COMMON.has(low)) return 'That password is too common. Please choose something only you would know.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return "Don't put your email address in your password.";
  const first = String(name).trim().split(/\s+/)[0].toLowerCase();
  if (first.length >= 4 && low.includes(first)) return "Don't put your name in your password.";
  if (!/[a-z]/i.test(p) || !/[^a-z]/i.test(p)) return 'Mix letters with numbers or symbols.';
  return '';
}
