/* ===============================
   MyNeedUrban — pwa.js
   Registers the service worker and offers "Install app".

   Works on any page that includes it. Chrome/Edge/Android get a real install
   button; iOS Safari gets short instructions since it has no install API.
   =============================== */

(() => {
  'use strict';

  const SW_PATH = new URL('sw.js', document.baseURI).pathname;

  // ── Register the service worker ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_PATH).catch(err => {
        console.warn('[pwa] service worker registration failed', err);
      });
    });
  }

  // ── Install flow ─────────────────────────────────────────────────────────
  let deferredPrompt = null;
  const btn = document.getElementById('installAppBtn');

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  function showBtn(label) {
    if (!btn) return;
    btn.hidden = false;
    const text = btn.querySelector('.pwa-label');
    if (text && label) text.textContent = label;
  }

  function hideBtn() { if (btn) btn.hidden = true; }

  // Already installed — nothing to offer.
  if (isStandalone()) {
    hideBtn();
  } else if (isIos()) {
    // iOS can't be prompted programmatically; guide the user instead.
    showBtn('Add to Home Screen');
    btn?.addEventListener('click', () => {
      alert(
        'To install MyNeedUrban on iPhone or iPad:\n\n' +
        '1. Tap the Share button in Safari\n' +
        '2. Scroll down and tap "Add to Home Screen"\n' +
        '3. Tap "Add"'
      );
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // stop Chrome's mini-infobar
    deferredPrompt = e;
    showBtn('Install App');
  });

  btn?.addEventListener('click', async () => {
    if (!deferredPrompt) return; // iOS path handled above
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null;
    hideBtn();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBtn();
  });
})();
