/* ===============================
   MyNeedUrban — pwa.js
   Registers the service worker, offers "Install app", and tells the visitor
   when a new version has been deployed.

   Works on every page that includes it: sw.js is resolved relative to THIS
   script (in /js/), not the page — the old page-relative path pointed
   /pages/*.html at /pages/sw.js, which doesn't exist.
   =============================== */

(() => {
  'use strict';

  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  const SW_URL = new URL('../sw.js', SCRIPT_SRC || location.href).href;

  // ── Service worker + "new version" banner ─────────────────────────────────
  if ('serviceWorker' in navigator) {
    let hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // The first install also fires this; only a *replacement* is an update.
      if (!hadController) { hadController = true; return; }
      showUpdateBanner();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_URL).catch(err => {
        console.warn('[pwa] service worker registration failed', err);
      });
    });
  }

  function showUpdateBanner() {
    if (document.getElementById('mnuUpdate')) return;
    const bar = document.createElement('div');
    bar.id = 'mnuUpdate';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:fixed', 'left:50%', 'top:calc(12px + env(safe-area-inset-top))',
      'transform:translateX(-50%)', 'z-index:400', 'display:flex', 'align-items:center',
      'gap:12px', 'padding:8px 8px 8px 16px', 'border-radius:999px', 'background:#0d1b2a',
      'color:#fff', 'font:600 14px/1.3 "Plus Jakarta Sans",system-ui,sans-serif',
      'box-shadow:0 16px 40px rgba(13,27,42,.35)', 'max-width:calc(100vw - 24px)',
    ].join(';');
    bar.innerHTML = '<span>A new version is ready</span>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Refresh';
    btn.style.cssText = 'border:0;border-radius:999px;padding:8px 14px;background:#1e90ff;color:#fff;font:inherit;font-weight:800;cursor:pointer';
    btn.addEventListener('click', () => location.reload());
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  // ── Install flow ───────────────────────────────────────────────────────────
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

  function iosHelp() {
    alert(
      'To install MyNeedUrban on iPhone or iPad:\n\n' +
      '1. Tap the Share button in Safari\n' +
      '2. Scroll down and tap "Add to Home Screen"\n' +
      '3. Tap "Add"'
    );
  }

  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
      hideBtn();
    } else if (isIos() && !isStandalone()) {
      iosHelp();
    }
  }

  // Used by the Menu sheet (js/app-shell.js)
  window.mnuInstall = {
    available: () => !isStandalone() && (!!deferredPrompt || isIos()),
    prompt: promptInstall,
  };

  if (isStandalone()) hideBtn();
  else if (isIos()) showBtn('Add to Home Screen');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // stop Chrome's mini-infobar; we offer our own button
    deferredPrompt = e;
    showBtn('Install App');
    document.dispatchEvent(new Event('mnu:installable'));
  });

  btn?.addEventListener('click', promptInstall);

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBtn();
  });
})();
