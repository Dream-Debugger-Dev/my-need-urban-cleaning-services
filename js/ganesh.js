/* ==========================================================================
   MyNeedUrban — ganesh.js
   Ganesh Chaturthi theme: canvas scene, countdown, toggle, petal burst.

   Self-contained. Deleting this file + css/ganesh.css restores the site
   exactly. The canvas scene is generated, so there are no video/image
   downloads, no licensing questions and nothing to 404.
   ========================================================================== */

(() => {
  'use strict';

  const THEME_KEY  = 'mnu-theme';
  const BANNER_KEY = 'mnu-gn-banner-closed';
  const FESTIVE    = 'ganesh';
  const ORIGINAL   = 'original';

  const MARIGOLD = '#f5a623';
  const TURMERIC = '#ffc300';
  const DEEP     = '#e07b1a';
  const GOLD     = '#d4af37';
  const CREAM    = '#fff3c4';
  const PETALS   = [MARIGOLD, TURMERIC, DEEP, GOLD, '#ff8f1f'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ── Theme state ──────────────────────────────────────────────────────── */
  const currentTheme = () =>
    root.getAttribute('data-theme') === ORIGINAL ? ORIGINAL : FESTIVE;

  function applyTheme(theme, { burst = false } = {}) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    updateToggle(theme);
    if (theme === FESTIVE) {
      startCanvas();
      if (burst && !reduceMotion) petalBurst(80);
    } else {
      stopCanvas();
    }
  }

  try {
    if (localStorage.getItem(THEME_KEY) === ORIGINAL) root.setAttribute('data-theme', ORIGINAL);
  } catch (_) {}

  /* ── Toggle ───────────────────────────────────────────────────────────── */
  const toggle = document.getElementById('gnThemeToggle');
  const label  = toggle && toggle.querySelector('.gn-t-label');

  function updateToggle(theme) {
    if (label) label.textContent = theme === FESTIVE ? 'Festive' : 'Classic';
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === FESTIVE));
      toggle.title = theme === FESTIVE
        ? 'Switch to the classic MyNeedUrban theme'
        : 'Switch to the Ganesh Chaturthi theme';
    }
  }

  if (toggle) {
    updateToggle(currentTheme());
    toggle.addEventListener('click', () => {
      const next = currentTheme() === FESTIVE ? ORIGINAL : FESTIVE;
      applyTheme(next, { burst: next === FESTIVE });
    });
  }

  /* ── Countdown to Ganesh Chaturthi ────────────────────────────────────── */
  // Festival dates are lunar, so they're listed explicitly rather than computed.
  const GANESH_DATES = [
    '2025-08-27', '2026-09-14', '2027-09-04', '2028-08-23',
    '2029-09-11', '2030-09-01', '2031-08-21', '2032-09-08',
  ];
  const VISARJAN_DAYS = 10;   // celebrations run ~10 days

  function festivalWindow() {
    const now = new Date();
    for (const d of GANESH_DATES) {
      const start = new Date(d + 'T00:00:00');
      const end   = new Date(start);
      end.setDate(end.getDate() + VISARJAN_DAYS);
      if (now < start) return { state: 'before', start };
      if (now <= end)  return { state: 'during', start, end };
    }
    return { state: 'unknown' };
  }

  const cdEl = document.getElementById('gnCountdown');
  const box = (v, l) =>
    `<span class="gn-cd">${String(v).padStart(2, '0')}<small>${l}</small></span>`;

  function renderCountdown() {
    if (!cdEl) return;
    const w = festivalWindow();

    if (w.state === 'during') {
      const day = Math.floor((new Date() - w.start) / 86400000) + 1;
      cdEl.innerHTML = `<b>Day ${day} of celebrations — Ganpati Bappa Morya!</b>`;
      return;
    }
    if (w.state !== 'before') { cdEl.innerHTML = ''; return; }

    const diff = w.start - new Date();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    cdEl.innerHTML = box(d, 'days') + box(h, 'hrs') + box(m, 'min') + box(s, 'sec');
  }
  renderCountdown();
  setInterval(renderCountdown, 1000);

  /* ── Dismissible banner ───────────────────────────────────────────────── */
  const banner = document.getElementById('gnBanner');
  try {
    if (banner && localStorage.getItem(BANNER_KEY) === '1') banner.style.display = 'none';
  } catch (_) {}
  document.getElementById('gnBannerClose')?.addEventListener('click', () => {
    if (banner) banner.style.display = 'none';
    try { localStorage.setItem(BANNER_KEY, '1'); } catch (_) {}
  });

  /* ── Scroll progress ──────────────────────────────────────────────────── */
  const progress = document.querySelector('.gn-progress');
  if (progress) {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = h > 0 ? `${(window.scrollY / h) * 100}%` : '0%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ── Optional hero video ──────────────────────────────────────────────── */
  // Nothing ships by default. Drop a clip at assets/video/ganesh-hero.mp4 and
  // it fades in over the gradient; if it's missing the element removes itself.
  const video = document.getElementById('gnVideo');
  if (video && !reduceMotion) {
    video.addEventListener('canplay', () => {
      video.classList.add('is-ready');
      video.play?.().catch(() => {});
    }, { once: true });
    video.addEventListener('error', () => video.remove(), { once: true });
  } else if (video) {
    video.remove();
  }

  /* ── Petal burst ──────────────────────────────────────────────────────── */
  function petalBurst(count = 80) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'gn-petal';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = PETALS[(Math.random() * PETALS.length) | 0];
      p.style.animationDuration = (2.6 + Math.random() * 2.4) + 's';
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.opacity = String(0.65 + Math.random() * 0.35);
      const w = 8 + Math.random() * 8;
      p.style.width = w + 'px';
      p.style.height = (w * 0.66) + 'px';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 5600);
    }
  }

  /* ── Canvas scene: petals · floating diyas · gold dust ────────────────── */
  const canvas = document.getElementById('gnCanvas');
  let ctx, raf = null, W = 0, H = 0, running = false;
  let petals = [], lamps = [], dust = [];

  function size() {
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = Math.max(1, W * dpr);
    canvas.height = Math.max(1, H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function newPetal(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -14,
      r: rnd(4, 9.5),
      vy: rnd(0.35, 1.15),
      vx: rnd(-0.35, 0.35),
      rot: Math.random() * Math.PI * 2,
      vr: rnd(-0.03, 0.03),
      sway: rnd(0.4, 1.3),
      phase: Math.random() * Math.PI * 2,
      a: rnd(0.5, 0.95),
      c: PETALS[(Math.random() * PETALS.length) | 0],
    };
  }

  function newLamp() {
    return {
      x: rnd(0.05, 0.95) * W,
      y: H + rnd(10, 120),
      r: rnd(1.6, 3.2),
      vy: rnd(0.22, 0.55),
      flick: Math.random() * Math.PI * 2,
      a: rnd(0.5, 0.95),
    };
  }

  function newDust() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: rnd(0.5, 1.6), a: rnd(0.15, 0.6),
      tw: rnd(0.015, 0.05), phase: Math.random() * Math.PI * 2,
    };
  }

  // Counts scale with viewport width and are capped so a phone never draws the
  // same load as a desktop. Measured ~1% canvas coverage at 1440px, which reads
  // clearly without competing with the headline.
  function build() {
    const petalCount = Math.max(22, Math.min(90, Math.round(W / 20)));
    petals = Array.from({ length: petalCount }, () => newPetal(true));
    lamps  = Array.from({ length: Math.max(6, Math.min(16, Math.round(W / 115))) }, newLamp);
    dust   = Array.from({ length: Math.max(40, Math.min(150, Math.round(W / 13))) }, newDust);
  }

  function frame(t) {
    if (!running || !ctx) return;
    ctx.clearRect(0, 0, W, H);

    // Gold dust twinkle
    for (const d of dust) {
      d.phase += d.tw;
      const a = d.a * (0.45 + 0.55 * Math.abs(Math.sin(d.phase)));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = CREAM;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Floating diya lights drifting upward
    for (let i = lamps.length - 1; i >= 0; i--) {
      const l = lamps[i];
      l.y -= l.vy;
      l.flick += 0.09;
      if (l.y < -30) { lamps[i] = newLamp(); continue; }
      const pulse = 0.75 + 0.25 * Math.sin(l.flick);
      ctx.save();
      ctx.globalAlpha = l.a * pulse;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 9);
      g.addColorStop(0, '#fff8c9');
      g.addColorStop(0.28, TURMERIC);
      g.addColorStop(1, 'rgba(224,123,26,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r * 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, l.a * pulse + 0.2);
      ctx.fillStyle = '#fffce8';
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Marigold petals falling with a gentle sway
    for (const p of petals) {
      p.phase += 0.02;
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.phase) * p.sway * 0.35;
      p.rot += p.vr;
      if (p.y > H + 14 || p.x < -25 || p.x > W + 25) Object.assign(p, newPetal(false));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      // layered ellipses read as a small marigold petal
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = p.a * 0.55;
      ctx.fillStyle = CREAM;
      ctx.beginPath(); ctx.ellipse(-p.r * 0.2, 0, p.r * 0.45, p.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    raf = requestAnimationFrame(frame);
  }

  function startCanvas() {
    if (!canvas || reduceMotion || running) return;
    ctx = ctx || canvas.getContext('2d');
    if (!ctx) return;
    size();
    if (!petals.length) build();
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stopCanvas() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  window.addEventListener('resize', () => { if (!canvas) return; size(); build(); });

  // Pause when the hero scrolls away or the tab is hidden — saves battery.
  const hero = document.getElementById('home');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (currentTheme() !== FESTIVE) return;
        e.isIntersecting ? startCanvas() : stopCanvas();
      });
    }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCanvas();
    else if (currentTheme() === FESTIVE) startCanvas();
  });

  if (currentTheme() === FESTIVE) startCanvas();

  /* ── Build the toran strands ──────────────────────────────────────────── */
  const toran = document.querySelector('.gn-toran');
  if (toran && !toran.children.length) {
    const strands = Math.max(12, Math.min(32, Math.round(window.innerWidth / 38)));
    toran.innerHTML = '<i></i>'.repeat(strands);
  }

  /* ── Greeting flourish on the festival days ───────────────────────────── */
  if (festivalWindow().state === 'during' && currentTheme() === FESTIVE && !reduceMotion) {
    setTimeout(() => petalBurst(120), 800);
  }
})();
