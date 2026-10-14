/* ==========================================================================
   MyNeedUrban — festival-fx.js
   Falling marigold petals and rising diya sparks over the hero.

   Loaded only when the visitor allows motion (prefers-reduced-motion is not
   "reduce" and Data Saver is off). It pauses when the hero is off screen or
   the tab is hidden, uses few particles, and thins itself out if the device
   struggles, so it never costs the page its snappiness.
   ========================================================================== */

const TAU = Math.PI * 2;
const PETALS = ['#ff8a00', '#ffa31a', '#ffb81f', '#ffcf3f', '#ff7a00', '#e8467c', '#fff1d6'];
const rnd = (a, b) => a + Math.random() * (b - a);

export function start(hero, { phone = false, burst = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fest-fx';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.querySelector('.hero-grid') || null);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return null; }

  const lowEnd = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
  let scale = (phone ? 0.5 : 1) * (lowEnd ? 0.6 : 1);   // thinned further if frames run long
  let W = 0, H = 0, dpr = 1;
  let petals = [];
  let sparks = [];
  let running = false;
  let inView = true;
  let last = 0;
  let frames = 0;
  let slow = [];             // recent frame gaps over 26 ms (a window of the last 90 frames)
  let strikes = 0;

  const targetPetals = () => Math.max(6, Math.round((W / 46) * scale));
  const targetSparks = () => Math.max(4, Math.round((W / 70) * scale));

  function petal(fromTop, fast) {
    const size = rnd(5, 10) * (phone ? 0.9 : 1);
    return {
      x: rnd(0, W), y: fromTop ? rnd(-H * 0.2, -10) : rnd(0, H),
      vy: rnd(24, 46) * (fast ? 2.4 : 1), sway: rnd(14, 38), phase: rnd(0, TAU), freq: rnd(0.5, 1.2),
      rot: rnd(0, TAU), vr: rnd(-1.6, 1.6), size, colour: PETALS[(Math.random() * PETALS.length) | 0],
      flip: rnd(0, TAU), temp: !!fast,
    };
  }
  function spark(anywhere) {
    return {
      x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 8, vy: -rnd(14, 34), drift: rnd(-6, 6),
      r: rnd(0.8, 2.2), phase: rnd(0, TAU), tw: rnd(1.5, 3.5),
    };
  }

  function fit() {
    const rect = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    while (petals.length < targetPetals()) petals.push(petal(false, false));
    petals.length = Math.min(petals.length, targetPetals() + 40);   // keep burst petals alive
    while (sparks.length < targetSparks()) sparks.push(spark(true));
    sparks.length = Math.min(sparks.length, targetSparks());
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const squash = 0.35 + 0.65 * Math.abs(Math.cos(p.flip));      // tumbling in the air
    ctx.scale(1, squash);
    ctx.fillStyle = p.colour;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-p.size * 0.2, -p.size * 0.1, p.size * 0.5, p.size * 0.16, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    // A full-screen dialog (the greeting card) is open: stand still and save the battery
    if (document.documentElement.classList.contains('fest-lock')) { requestAnimationFrame(tick); return; }

    // Adapt to the device. The first second is ignored (the page is still loading,
    // so every phone is busy). After that, if most of the last 90 frames took
    // over 26 ms (under ~38 fps) use half the particles; if it is still that
    // slow 90 frames later, drop the effect: the page matters more than petals.
    frames++;
    if (frames > 60) {
      slow.push(dt > 0.026 ? 1 : 0);
      if (slow.length === 90) {
        const share = slow.reduce((a, c) => a + c, 0) / 90;
        slow = [];
        if (share > 0.6) {
          strikes++;
          if (strikes >= 2) { stop(); return; }
          scale *= 0.5;
          fit();
        }
      }
    }

    ctx.clearRect(0, 0, W, H);
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.y += p.vy * dt;
      p.phase += p.freq * dt;
      p.x += Math.sin(p.phase) * p.sway * dt;
      p.rot += p.vr * dt;
      p.flip += dt * 2.2;
      if (p.y > H + 14) {
        if (p.temp) { petals.splice(i, 1); continue; }         // burst petals leave for good
        p.y = rnd(-30, -8); p.x = rnd(0, W);
      }
      if (p.x < -20) p.x = W + 10; else if (p.x > W + 20) p.x = -10;
      drawPetal(p);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      s.y += s.vy * dt;
      s.x += s.drift * dt;
      s.phase += s.tw * dt;
      if (s.y < -8) { s.y = H + 8; s.x = rnd(0, W); }
      const a = 0.25 + 0.55 * Math.abs(Math.sin(s.phase));
      const fade = Math.min(1, s.y / (H * 0.25));              // dim as they rise out
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      g.addColorStop(0, `rgba(255,214,120,${a * fade})`);
      g.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 4, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(tick);
  }

  function run() {
    if (running || !inView || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  function pause() { running = false; }
  function stop() { running = false; io.disconnect(); ro.disconnect(); canvas.remove(); document.removeEventListener('visibilitychange', onVis); }

  const onVis = () => (document.hidden ? pause() : run());
  const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) run(); else pause(); });
  const ro = new ResizeObserver(() => fit());
  io.observe(hero);
  ro.observe(hero);
  document.addEventListener('visibilitychange', onVis);

  fit();
  if (burst) {                                                  // a welcome shower, once per visit
    const n = phone ? 22 : 44;
    for (let i = 0; i < n; i++) { const p = petal(true, true); p.y = rnd(-H * 0.6, -6); petals.push(p); }
  }
  canvas.classList.add('ready');
  run();
  return { stop };
}
