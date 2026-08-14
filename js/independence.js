/* ==========================================================================
   MyNeedUrban — independence.js
   Independence Day seasonal theme: switcher, countdown, canvas fireworks,
   tricolour petals, scroll progress, confetti burst.

   Self-contained. Removing this file + css/independence.css restores the
   original site exactly. See css/themes/README.md
   ========================================================================== */

(() => {
  'use strict';

  const THEME_KEY   = 'mnu-theme';
  const BANNER_KEY  = 'mnu-id-banner-closed';
  const FESTIVE     = 'independence';
  const ORIGINAL    = 'original';

  const SAFFRON = '#ff9933';
  const WHITE   = '#ffffff';
  const GREEN   = '#138808';
  const CHAKRA  = '#000080';
  const TRI     = [SAFFRON, WHITE, GREEN, '#ffd9b0', '#b9f0b3'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ── Theme state ──────────────────────────────────────────────────────── */
  function currentTheme() {
    return root.getAttribute('data-theme') === ORIGINAL ? ORIGINAL : FESTIVE;
  }

  function applyTheme(theme, { burst = false } = {}) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    updateToggleLabel(theme);

    if (theme === FESTIVE) {
      startCanvas();
      if (burst && !reduceMotion) confettiBurst();
    } else {
      stopCanvas();
    }
  }

  // Restore saved preference (defaults to the festive theme)
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === ORIGINAL) root.setAttribute('data-theme', ORIGINAL);
  } catch (_) {}

  /* ── Theme toggle button ──────────────────────────────────────────────── */
  const toggle = document.getElementById('idThemeToggle');
  const label  = toggle && toggle.querySelector('.id-tt-label');

  function updateToggleLabel(theme) {
    if (!label) return;
    label.textContent = theme === FESTIVE ? 'Independence' : 'Classic';
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === FESTIVE));
      toggle.title = theme === FESTIVE
        ? 'Switch to the classic MyNeedUrban theme'
        : 'Switch to the Independence Day theme';
    }
  }

  if (toggle) {
    updateToggleLabel(currentTheme());
    toggle.addEventListener('click', () => {
      const next = currentTheme() === FESTIVE ? ORIGINAL : FESTIVE;
      applyTheme(next, { burst: next === FESTIVE });
    });
  }

  /* ── Countdown to 15 August ───────────────────────────────────────────── */
  const cdEl = document.getElementById('idCountdown');

  function nextIndependenceDay() {
    const now = new Date();
    let year = now.getFullYear();
    const target = new Date(year, 7, 15, 0, 0, 0); // Aug = month 7
    if (now > new Date(year, 7, 15, 23, 59, 59)) {
      return new Date(year + 1, 7, 15, 0, 0, 0);
    }
    return target;
  }

  function isIndependenceDay() {
    const n = new Date();
    return n.getMonth() === 7 && n.getDate() === 15;
  }

  function box(v, l) {
    return `<span class="id-cd-box">${String(v).padStart(2, '0')}<small>${l}</small></span>`;
  }

  function renderCountdown() {
    if (!cdEl) return;

    if (isIndependenceDay()) {
      cdEl.innerHTML = `<b>Happy Independence Day!</b>`;
      return;
    }

    const diff = nextIndependenceDay() - new Date();
    if (diff <= 0) { cdEl.innerHTML = `<b>Happy Independence Day!</b>`; return; }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;

    cdEl.innerHTML = box(d, 'days') + box(h, 'hrs') + box(m, 'min') + box(s, 'sec');
  }

  renderCountdown();
  setInterval(renderCountdown, 1000);

  /* ── Dismissible banner ───────────────────────────────────────────────── */
  const banner = document.getElementById('idBanner');
  const bannerClose = document.getElementById('idBannerClose');

  try {
    if (banner && localStorage.getItem(BANNER_KEY) === '1') banner.style.display = 'none';
  } catch (_) {}

  if (bannerClose && banner) {
    bannerClose.addEventListener('click', () => {
      banner.style.display = 'none';
      try { localStorage.setItem(BANNER_KEY, '1'); } catch (_) {}
    });
  }

  /* ── Scroll progress bar ──────────────────────────────────────────────── */
  const progress = document.querySelector('.id-progress');
  if (progress) {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = h > 0 ? `${(window.scrollY / h) * 100}%` : '0%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ── Confetti burst (theme switch celebration) ────────────────────────── */
  function confettiBurst(count = 70) {
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.className = 'id-confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = TRI[(Math.random() * TRI.length) | 0];
      c.style.animationDuration = (2.4 + Math.random() * 2.2) + 's';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.opacity = String(0.65 + Math.random() * 0.35);
      const w = 6 + Math.random() * 6;
      c.style.width = w + 'px';
      c.style.height = (w * 1.5) + 'px';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 5200);
    }
  }

  /* ── Hero canvas: fireworks + drifting tricolour petals ───────────────── */
  const canvas = document.getElementById('idCanvas');
  let ctx, raf = null, W = 0, H = 0;
  let petals = [], sparks = [], rockets = [];
  let lastLaunch = 0;
  let running = false;

  function sizeCanvas() {
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = host.clientWidth;
    H = host.clientHeight;
    canvas.width  = Math.max(1, W * dpr);
    canvas.height = Math.max(1, H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makePetals() {
    const target = Math.max(14, Math.min(34, Math.round(W / 42)));
    petals = Array.from({ length: target }, () => spawnPetal(true));
  }

  function spawnPetal(anywhere = false) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -14,
      r: 2.5 + Math.random() * 4.5,
      sp: 0.25 + Math.random() * 0.7,
      dr: (Math.random() - 0.5) * 0.5,
      a: 0.18 + Math.random() * 0.4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.03,
      c: TRI[(Math.random() * 3) | 0]
    };
  }

  function launchRocket() {
    rockets.push({
      x: W * (0.12 + Math.random() * 0.76),
      y: H + 8,
      vy: -(2.6 + Math.random() * 1.5),
      ty: H * (0.12 + Math.random() * 0.3),
      c: TRI[(Math.random() * 3) | 0]
    });
  }

  function explode(x, y, colour) {
    const n = 26 + ((Math.random() * 16) | 0);
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.22;
      const spd = 1 + Math.random() * 2.9;
      sparks.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        c: Math.random() < 0.18 ? colour : TRI[(Math.random() * TRI.length) | 0],
        r: 1 + Math.random() * 1.7
      });
    }
  }

  function frame(ts) {
    if (!running || !ctx) return;
    ctx.clearRect(0, 0, W, H);

    // Petals
    for (const p of petals) {
      p.y += p.sp;
      p.x += p.dr;
      p.rot += p.vr;
      if (p.y > H + 14 || p.x < -20 || p.x > W + 20) Object.assign(p, spawnPetal());
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Launch a rocket every ~1.6–3.2s
    if (ts - lastLaunch > 1600 + Math.random() * 1600 && rockets.length < 3) {
      launchRocket();
      lastLaunch = ts;
    }

    // Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x, r.y + 12);
      ctx.stroke();
      ctx.restore();
      if (r.y <= r.ty) { explode(r.x, r.y, r.c); rockets.splice(i, 1); }
    }

    // Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.028;      // gravity
      s.vx *= 0.985;      // drag
      s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    raf = requestAnimationFrame(frame);
  }

  function startCanvas() {
    if (!canvas || reduceMotion || running) return;
    ctx = ctx || canvas.getContext('2d');
    if (!ctx) return;
    sizeCanvas();
    if (!petals.length) makePetals();
    running = true;
    lastLaunch = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stopCanvas() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  window.addEventListener('resize', () => {
    if (!canvas) return;
    sizeCanvas();
    makePetals();
  });

  // Pause the canvas when the hero scrolls out of view or the tab is hidden
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

  /* ── Greeting on Independence Day itself ──────────────────────────────── */
  if (isIndependenceDay() && currentTheme() === FESTIVE && !reduceMotion) {
    setTimeout(() => confettiBurst(110), 700);
  }
})();
