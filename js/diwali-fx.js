/* ==========================================================================
   MyNeedUrban — diwali-fx.js
   The moving parts of the Diwali theme, drawn on <canvas>:

     createHero(canvas)   ambient fireworks, rising embers and falling marigold
                          petals behind the hero. Pauses when the hero is off
                          screen or the tab is hidden, and thins itself out (then
                          stops) if the device struggles: the page matters more.
     createOverlay()      a full-screen canvas that exists only while something is
                          happening: tap bursts, cursor sparkles, confetti and the
                          big fireworks finale. It removes itself when idle.
     createSound()        soft chimes and crackers made with the Web Audio API
                          (no audio files). Off until the visitor switches it on.

   Loaded only when effects are on (js/diwali.js).
   ========================================================================== */

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const COLORS = ['#ffd45e', '#ffb52e', '#ff7a2a', '#ff4f93', '#7cf2a6', '#4fc3ff', '#c792ff', '#fff2c4'];
const GOLDS = ['#fff2c4', '#ffe08a', '#ffd45e', '#ffb52e'];
const PETALS = ['#ff8a00', '#ffa31a', '#ffb81f', '#ffcf3f', '#ff7a00', '#e8467c', '#fff1d6'];

// ─── Fireworks, shared by the hero and the overlay ────────────────────────────
/** Creates the sparks of one burst. `kind`: peony | ring | willow | double | heart-less simple star. */
function burstSparks(x, y, { kind = 'peony', color, scale = 1 } = {}) {
  const out = [];
  const c1 = color || pick(COLORS);
  const c2 = pick(COLORS);
  const add = (n, speed, spread, max, o = {}) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.06, 0.06);
      const sp = speed * (1 - spread + Math.random() * spread * 2);
      out.push({
        x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, max: max * rnd(0.8, 1.2),
        c: o.c || c1, w: o.w || rnd(1.1, 2.3), g: o.g ?? 72, drag: o.drag ?? 0.982, tw: Math.random() < 0.32,
      });
    }
  };
  const n = (v) => Math.max(10, Math.round(v * scale));
  if (kind === 'ring') { add(n(54), 150, 0.02, 1.5); add(n(22), 70, 0.1, 1.2, { c: c2 }); }
  else if (kind === 'willow') { add(n(80), 130, 0.55, 2.5, { c: pick(GOLDS), g: 52, drag: 0.972, w: 1.5 }); }
  else if (kind === 'double') { add(n(46), 175, 0.1, 1.5); add(n(34), 95, 0.12, 1.3, { c: c2 }); }
  else { add(n(72), 165, 0.45, 1.55); }
  return out;
}

function drawSparks(ctx, sparks) {
  ctx.lineCap = 'round';
  for (const s of sparks) {
    const k = 1 - s.age / s.max;
    if (k <= 0) continue;
    const a = s.tw ? k * (0.55 + 0.45 * Math.abs(Math.sin(s.age * 30))) : k;
    ctx.globalAlpha = Math.min(1, a * 1.15);
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * (0.5 + 0.5 * k);
    ctx.beginPath();
    ctx.moveTo(s.px, s.py);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function stepSparks(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.age += dt;
    if (s.age >= s.max) { list.splice(i, 1); continue; }
    const d = s.drag ** (dt * 60);
    s.vx *= d; s.vy = s.vy * d + s.g * dt;
    s.px = s.x; s.py = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
  }
}

function stepRockets(rockets, dt, onExplode) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.vy += 250 * dt;
    r.px = r.x; r.py = r.y;
    r.x += r.vx * dt; r.y += r.vy * dt;
    if (r.vy > -60 || r.y <= r.ty) { rockets.splice(i, 1); onExplode(r); }
  }
}

function drawRockets(ctx, rockets) {
  ctx.lineCap = 'round';
  for (const r of rockets) {
    ctx.strokeStyle = 'rgba(255,226,150,.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - r.vx * 0.09, r.y - r.vy * 0.09); ctx.lineTo(r.x, r.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,170,60,.5)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(r.x - r.vx * 0.2, r.y - r.vy * 0.2); ctx.lineTo(r.x, r.y); ctx.stroke();
  }
}

// ─── The hero ─────────────────────────────────────────────────────────────────
export function createHero(canvas, { phone = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
  let scale = (phone ? 0.6 : 1) * (lowEnd ? 0.6 : 1);
  let W = 1, H = 1, dpr = 1;
  let running = false, inView = true, last = 0, frames = 0, slow = [], strikes = 0, wait = 1.1;
  let hook = null;                                          // called with the burst position (sound)
  const rockets = [], sparks = [], embers = [], petals = [];

  const ember = (anywhere) => ({ x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 8, vy: -rnd(14, 34), drift: rnd(-6, 6), r: rnd(0.8, 2.2), phase: rnd(0, TAU), tw: rnd(1.5, 3.5) });
  const petal = (top) => ({
    x: rnd(0, W), y: top ? rnd(-H * 0.2, -10) : rnd(0, H), vy: rnd(22, 44), sway: rnd(14, 36), phase: rnd(0, TAU), freq: rnd(0.5, 1.2),
    rot: rnd(0, TAU), vr: rnd(-1.6, 1.6), size: rnd(4.5, 9) * (phone ? 0.9 : 1), colour: pick(PETALS), flip: rnd(0, TAU),
  });
  const wantEmbers = () => Math.max(6, Math.round((W / 64) * scale));
  const wantPetals = () => Math.max(4, Math.round((W / 100) * scale));

  function fit() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    while (embers.length < wantEmbers()) embers.push(ember(true));
    embers.length = Math.min(embers.length, wantEmbers());
    while (petals.length < wantPetals()) petals.push(petal(false));
    petals.length = Math.min(petals.length, wantPetals());
  }

  function launch(x, ty) {
    rockets.push({
      x: x ?? rnd(W * 0.1, W * 0.9), y: H + 6, px: 0, py: 0, vx: rnd(-22, 22),
      vy: -rnd(330, 440) * Math.min(1.25, Math.max(0.7, H / 620)), ty: ty ?? rnd(H * 0.1, H * 0.46),
    });
  }
  const explode = (r) => {
    const kind = pick(['peony', 'peony', 'ring', 'willow', 'double']);
    for (const s of burstSparks(r.x, r.y, { kind, scale })) sparks.push(s);
    if (hook) hook(r.x, r.y);
  };

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
    ctx.fillStyle = p.colour;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-p.size * 0.2, -p.size * 0.1, p.size * 0.5, p.size * 0.16, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (document.documentElement.classList.contains('dw-lock')) { requestAnimationFrame(tick); return; }   // a dialog is open: stand still

    // Adapt to the device: if most of the last 90 frames were slow, halve the effect; if it stays slow, stop.
    frames++;
    if (frames > 60) {
      slow.push(dt > 0.026 ? 1 : 0);
      if (slow.length === 90) {
        const share = slow.reduce((a, c) => a + c, 0) / 90;
        slow = [];
        if (share > 0.6) { strikes++; if (strikes >= 2) { stop(); return; } scale *= 0.5; fit(); }
      }
    }

    wait -= dt;
    if (wait <= 0 && rockets.length < (phone ? 1 : 2)) { launch(); wait = rnd(phone ? 2.4 : 1.6, phone ? 4.6 : 3.6); }
    stepRockets(rockets, dt, explode);
    stepSparks(sparks, dt);

    ctx.clearRect(0, 0, W, H);
    for (const p of petals) {
      p.y += p.vy * dt; p.phase += p.freq * dt; p.x += Math.sin(p.phase) * p.sway * dt; p.rot += p.vr * dt; p.flip += dt * 2.2;
      if (p.y > H + 14) { p.y = rnd(-30, -8); p.x = rnd(0, W); }
      if (p.x < -20) p.x = W + 10; else if (p.x > W + 20) p.x = -10;
      drawPetal(p);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of embers) {
      s.y += s.vy * dt; s.x += s.drift * dt; s.phase += s.tw * dt;
      if (s.y < -8) { s.y = H + 8; s.x = rnd(0, W); }
      const a = (0.25 + 0.55 * Math.abs(Math.sin(s.phase))) * Math.min(1, s.y / (H * 0.25));
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      g.addColorStop(0, `rgba(255,214,120,${a})`);
      g.addColorStop(1, 'rgba(255,170,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, TAU); ctx.fill();
    }
    drawRockets(ctx, rockets);
    drawSparks(ctx, sparks);
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(tick);
  }

  function run() { if (running || !inView || document.hidden) return; running = true; last = performance.now(); requestAnimationFrame(tick); }
  function pause() { running = false; }
  function stop() { running = false; io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); ctx.clearRect(0, 0, W, H); canvas.classList.remove('is-on'); }
  const onVis = () => (document.hidden ? pause() : run());
  const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) run(); else pause(); });
  const ro = new ResizeObserver(() => fit());
  io.observe(canvas);
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVis);

  fit();
  canvas.classList.add('is-on');
  run();
  return {
    stop,
    onBurst(fn) { hook = fn; },
    /** A run of rockets, for the finale. */
    finale(n = 7) { for (let i = 0; i < n; i++) setTimeout(() => launch(W * (0.12 + (0.76 * i) / Math.max(1, n - 1)), rnd(H * 0.1, H * 0.4)), i * 230); },
  };
}

// ─── The overlay: taps, sparkles, confetti and the finale ─────────────────────
export function createOverlay({ phone = false } = {}) {
  let canvas = null, ctx = null, W = 0, H = 0, dpr = 1, running = false, last = 0, idleSince = 0;
  const sparks = [], stars = [], bits = [], rockets = [];
  let hook = null;

  function fit() {
    if (!canvas) return;
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function ensure() {
    if (canvas) return true;
    canvas = document.createElement('canvas');
    canvas.id = 'dwOverlay';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); canvas = null; return false; }
    fit();
    window.addEventListener('resize', fit);
    return true;
  }
  function release() {
    running = false;
    if (!canvas) return;
    window.removeEventListener('resize', fit);
    canvas.remove(); canvas = null; ctx = null;
  }
  function wake() { if (!running && canvas) { running = true; last = performance.now(); idleSince = 0; requestAnimationFrame(tick); } }

  function drawStar(s) {
    const k = 1 - s.age / s.max;
    if (k <= 0) return;
    ctx.globalAlpha = k;
    ctx.fillStyle = s.c;
    const r = s.r * (0.5 + 0.5 * k), t = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + t, s.y - t); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x + t, s.y + t);
    ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - t, s.y + t); ctx.lineTo(s.x - r, s.y); ctx.lineTo(s.x - t, s.y - t);
    ctx.closePath(); ctx.fill();
  }

  function tick(now) {
    if (!running || !canvas) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    stepRockets(rockets, dt, (r) => { for (const s of burstSparks(r.x, r.y, { kind: pick(['peony', 'ring', 'double', 'willow']), scale: phone ? 0.7 : 1 })) sparks.push(s); if (hook) hook(r.x, r.y); wake(); });
    stepSparks(sparks, dt);
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i]; s.age += dt;
      if (s.age >= s.max) { stars.splice(i, 1); continue; }
      s.vy += 60 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.age += dt;
      if (b.age >= b.max || b.y > H + 20) { bits.splice(i, 1); continue; }
      b.vx *= 0.992; b.vy += 340 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt; b.flip += dt * 7;
    }
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.cos(b.flip)));
      ctx.globalAlpha = Math.min(1, (1 - b.age / b.max) * 2); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawRockets(ctx, rockets);
    drawSparks(ctx, sparks);
    for (const s of stars) drawStar(s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (sparks.length + stars.length + bits.length + rockets.length === 0) {
      idleSince = idleSince || now;
      if (now - idleSince > 700) { release(); return; }
    } else idleSince = 0;
    requestAnimationFrame(tick);
  }

  return {
    onBurst(fn) { hook = fn; },
    /** A small burst of sparks where you tapped. */
    burst(x, y, color) {
      if (!ensure()) return;
      for (const s of burstSparks(x, y, { kind: 'peony', color, scale: phone ? 0.34 : 0.42 })) { s.max *= 0.62; s.vx *= 0.7; s.vy *= 0.7; sparks.push(s); }
      wake();
    },
    /** One twinkling gold star, for the cursor trail. */
    sparkle(x, y) {
      if (!ensure()) return;
      if (stars.length > 46) return;
      stars.push({ x: x + rnd(-5, 5), y: y + rnd(-3, 7), vx: rnd(-14, 14), vy: rnd(-26, 6), age: 0, max: rnd(0.5, 0.95), r: rnd(3, 7.5), c: pick(GOLDS) });
      wake();
    },
    /** Gold, saffron and pink confetti from a point (or the top of the screen). */
    confetti(x, y, n = 70) {
      if (!ensure()) return;
      const cx = x ?? W / 2, cy = y ?? H * 0.3;
      for (let i = 0; i < n * (phone ? 0.6 : 1); i++) {
        const a = rnd(-Math.PI, 0), sp = rnd(120, 420);
        bits.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(0, TAU), vr: rnd(-8, 8), flip: rnd(0, TAU), w: rnd(5, 10), h: rnd(3, 6), age: 0, max: rnd(2, 3.4), c: pick(COLORS) });
      }
      wake();
    },
    /** The big finish: fireworks across the whole screen, then confetti. */
    finale() {
      if (!ensure()) return;
      const n = phone ? 6 : 10;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (!ensure()) return;
          rockets.push({ x: W * (0.1 + 0.8 * Math.random()), y: H + 6, px: 0, py: 0, vx: rnd(-20, 20), vy: -rnd(420, 560) * Math.min(1.2, H / 760), ty: rnd(H * 0.12, H * 0.45) });
          wake();
        }, i * 260);
      }
      setTimeout(() => this.confetti(W / 2, H * 0.35, 90), 700);
    },
    isBusy: () => !!canvas,
  };
}

// ─── Sound (opt-in): synthesized, so no audio files are downloaded ────────────
export function createSound() {
  let ac = null;
  let on = false;
  const ctx = () => {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  const noise = (c, secs) => {
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * secs)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = c.createBufferSource(); s.buffer = buf; return s;
  };
  return {
    get on() { return on; },
    set on(v) { on = !!v; if (on) ctx(); },
    /** A cracker: a burst of filtered noise and a low thump. */
    pop(vol = 0.5) {
      const c = on && ctx(); if (!c) return;
      const t = c.currentTime;
      const n = noise(c, 0.35); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      n.connect(f).connect(g).connect(c.destination); n.start(t);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const og = c.createGain(); og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.25);
    },
    /** A soft temple-bell note. */
    chime(freq = 880, vol = 0.16) {
      const c = on && ctx(); if (!c) return;
      const t = c.currentTime;
      for (const [mul, v] of [[1, 1], [2.01, 0.45], [3.02, 0.2]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * mul;
        const g = c.createGain(); g.gain.setValueAtTime(vol * v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.5);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.6);
      }
    },
    /** A rocket rushing up. */
    whoosh(vol = 0.12) {
      const c = on && ctx(); if (!c) return;
      const t = c.currentTime;
      const n = noise(c, 0.7); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      n.connect(f).connect(g).connect(c.destination); n.start(t);
    },
  };
}
