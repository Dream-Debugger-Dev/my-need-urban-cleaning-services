/* ==========================================================================
   MyNeedUrban — festival-art.js
   Procedural festive art for the Navratri · Bathukamma · Dasara theme, drawn
   with canvas calls: a Bathukamma flower stack, marigolds, diyas, a rangoli
   style mandala and a marigold toran. Nothing is downloaded (no images, no
   licences, nothing to 404). Shared by festival.js (the festive card) and
   festival-card.js (the shareable greeting card).
   ========================================================================== */

const TAU = Math.PI * 2;

/** Small seeded random generator, so the art looks the same on every load. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parses '#rrggbb' or 'rgb(r,g,b)' into [r, g, b]. */
function rgbOf(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  return m ? [+m[1], +m[2], +m[3]] : [255, 160, 0];   // never NaN: a bad colour would draw black
}

/** Lightens (amt > 0) or darkens (amt < 0) a '#rrggbb' or 'rgb(...)' colour. */
export function shade(colour, amt) {
  let [r, g, b] = rgbOf(colour);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

export const MARIGOLDS = ['#ff8a00', '#ffa31a', '#ffb81f', '#ff7a00'];
const GREENS = ['#2f9e4f', '#1f7a3b', '#3fae5a', '#256f3a'];

// ─── Flowers ──────────────────────────────────────────────────────────────────

/** A full marigold (genda) bloom: four rings of petals. r = radius in px. */
export function marigold(ctx, x, y, r, rand = Math.random, base) {
  const col = base || MARIGOLDS[(rand() * MARIGOLDS.length) | 0];
  const rings = [
    { n: 12, d: 0.56, rx: 0.46, ry: 0.27, c: shade(col, -0.10) },
    { n: 10, d: 0.40, rx: 0.36, ry: 0.22, c: col },
    { n: 8,  d: 0.25, rx: 0.26, ry: 0.17, c: shade(col, 0.22) },
    { n: 6,  d: 0.11, rx: 0.16, ry: 0.11, c: shade(col, 0.42) },
  ];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rand() * TAU);
  for (const ring of rings) {
    const off = rand() * TAU;
    ctx.fillStyle = ring.c;
    for (let i = 0; i < ring.n; i++) {
      ctx.save();
      ctx.rotate(off + (i / ring.n) * TAU);
      ctx.beginPath();
      ctx.ellipse(r * ring.d, 0, r * ring.rx, r * ring.ry, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#9a3d00';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A small round bloom, used in bulk for the Bathukamma tiers. */
function bloom(ctx, x, y, r, colour, rand) {
  ctx.fillStyle = shade(colour, (rand() - 0.5) * 0.2);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(colour, 0.4);
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.42, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,20,0,.18)';
  ctx.lineWidth = Math.max(0.4, r * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/** A pointed mango leaf, from its stalk at (x, y) pointing along `angle`. */
export function leaf(ctx, x, y, len, angle, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.30, -len * 0.22, len * 0.72, -len * 0.20, len, 0);
  ctx.bezierCurveTo(len * 0.72, len * 0.20, len * 0.30, len * 0.22, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,50,15,.38)';
  ctx.lineWidth = Math.max(0.5, len * 0.04);
  ctx.beginPath();
  ctx.moveTo(len * 0.05, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

// ─── Bathukamma ───────────────────────────────────────────────────────────────

const TIER_COLOURS = ['#ffd23f', '#e8467c', '#fff1d6', '#ff8a1f', '#b07be0', '#ffdc4d', '#ff7aa8'];

/**
 * Telangana's floral stack: seven tiers of seasonal flowers (yellow tangedu,
 * pink celosia, white gunuka, orange marigold...), a turmeric Gauramma cone
 * and a marigold on top. `width` is the stack's widest point; (cx, baseY) is
 * the centre of its bottom edge. Drawn in a 200-unit design space.
 */
export function bathukamma(ctx, cx, baseY, width, rand = seeded(11)) {
  const s = width / 184;
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(s, s);

  // soft ground shadow
  ctx.save();
  ctx.translate(0, 26);
  ctx.scale(1, 0.14);
  const sh = ctx.createRadialGradient(0, 0, 4, 0, 0, 100);
  sh.addColorStop(0, 'rgba(0,0,0,.38)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, TAU);
  ctx.fill();
  ctx.restore();

  const N = TIER_COLOURS.length;
  let cy = 0;            // top-surface centre of the previous tier (0 = ground line)
  let topCy = 0;
  for (let i = 0; i < N; i++) {
    const rx = 92 - i * 12.6;
    const ry = rx * 0.27;
    const h = 25 - i * 1.5;
    const col = TIER_COLOURS[i];
    const bottomY = cy;            // this tier stands on the centre of the one below
    cy = bottomY - h;              // its own top-surface centre
    topCy = cy;
    const pick = () => (rand() < 0.22 ? shade(col, rand() < 0.5 ? -0.16 : 0.2) : col);

    // 1. side band, shaded darker toward the bottom
    const g = ctx.createLinearGradient(0, cy, 0, bottomY + ry);
    g.addColorStop(0, shade(col, -0.04));
    g.addColorStop(1, shade(col, -0.42));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-rx, cy);
    ctx.lineTo(-rx, bottomY);
    ctx.ellipse(0, bottomY, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(rx, cy);
    ctx.closePath();
    ctx.fill();

    // 2. green leaf fringe along the front of the rim
    const m = Math.max(10, Math.round(rx / 3.5));
    for (let k = 1; k < m; k += 2) {
      const t = (k + 0.5) / m * Math.PI;
      leaf(ctx, -Math.cos(t) * rx, cy + Math.sin(t) * ry - 1, 10 + rand() * 4,
        Math.PI / 2 - Math.cos(t) * 0.7, GREENS[(rand() * GREENS.length) | 0]);
    }

    // 3. rows of blooms around the side band
    const br = Math.max(2.8, 4.3 - i * 0.18);
    for (let k = 0; k < m; k++) {
      const t = (k + 0.5) / m * Math.PI;
      const x = -Math.cos(t) * rx * 0.985;
      const edge = Math.sin(t) * ry;
      for (const row of [0.14, 0.5, 0.88]) {
        bloom(ctx, x + (rand() - 0.5) * 1.2, cy + h * row + edge, br, pick(), rand);
      }
    }

    // 4. top surface: darker base, then the outer ring of blooms
    ctx.fillStyle = shade(col, -0.16);
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    const inner = i < N - 1 ? (92 - (i + 1) * 12.6) / rx : 0;
    for (let f = 0.94; f > Math.max(inner - 0.06, 0.12); f -= 0.18) {
      const m2 = Math.max(7, Math.round(rx * f / 3.3));
      for (let k = 0; k < m2; k++) {
        const t = (k + rand() * 0.5) / m2 * TAU;
        bloom(ctx, Math.cos(t) * rx * f, cy + Math.sin(t) * ry * f, br * 0.92, pick(), rand);
      }
    }
    // glossy highlight on the top surface
    const hl = ctx.createRadialGradient(-rx * 0.3, cy - ry * 0.3, 1, -rx * 0.3, cy - ry * 0.3, rx * 0.8);
    hl.addColorStop(0, 'rgba(255,255,255,.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  // 5. Gauramma: a small turmeric cone with a kumkum dot, and a marigold on top
  const coneH = 34;
  const cg = ctx.createLinearGradient(-9, 0, 9, 0);
  cg.addColorStop(0, '#e29a12');
  cg.addColorStop(0.5, '#ffd24a');
  cg.addColorStop(1, '#c97f08');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-10, topCy);
  ctx.quadraticCurveTo(-5, topCy - coneH * 0.9, 0, topCy - coneH);
  ctx.quadraticCurveTo(5, topCy - coneH * 0.9, 10, topCy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c1121f';
  ctx.beginPath();
  ctx.arc(0, topCy - coneH * 0.45, 2.3, 0, TAU);
  ctx.fill();
  marigold(ctx, 0, topCy - coneH - 3, 10, rand, '#ff8a00');

  ctx.restore();
}

// ─── Diya ─────────────────────────────────────────────────────────────────────

/** A clay lamp. (x, y) is the centre of its rim; s scales it (1 = 52px wide). */
export function diya(ctx, x, y, s = 1, { lit = true, tint = '#ff8a1f' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (lit) {
    const glow = ctx.createRadialGradient(0, -18, 2, 0, -18, 78);
    glow.addColorStop(0, 'rgba(255,190,70,.55)');
    glow.addColorStop(1, 'rgba(255,190,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -18, 78, 0, TAU);
    ctx.fill();
  }
  const clay = ctx.createLinearGradient(0, 0, 0, 24);
  clay.addColorStop(0, '#e0702e');
  clay.addColorStop(1, '#7a2c0a');
  ctx.fillStyle = clay;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.bezierCurveTo(-26, 20, -12, 24, 0, 24);
  ctx.bezierCurveTo(12, 24, 26, 20, 26, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-23, 6);
  ctx.bezierCurveTo(-17, 17, -8, 19, 0, 19);
  ctx.bezierCurveTo(8, 19, 17, 17, 23, 6);
  ctx.stroke();
  ctx.fillStyle = '#4a1805';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 5.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = lit ? '#ffcf70' : '#2d1004';
  ctx.beginPath();
  ctx.ellipse(0, -0.4, 21.5, 3.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b1204';
  ctx.fillRect(-1.2, -9, 2.4, 9);
  if (lit) {
    const f = ctx.createLinearGradient(0, -42, 0, -8);
    f.addColorStop(0, '#fff6c8');
    f.addColorStop(0.5, '#ffc83a');
    f.addColorStop(1, '#ff7a00');
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(0, -43);
    ctx.bezierCurveTo(12, -27, 9, -11, 0, -7);
    ctx.bezierCurveTo(-9, -11, -12, -27, 0, -43);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.bezierCurveTo(4.5, -23, 3.6, -15, 0, -12);
    ctx.bezierCurveTo(-3.6, -15, -4.5, -23, 0, -30);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Mandala ──────────────────────────────────────────────────────────────────

/** A rangoli / lotus style line mandala centred on (cx, cy) with radius R. */
export function mandala(ctx, cx, cy, R, colour = 'rgba(255,196,60,1)', lw = 1.4) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const circle = (r) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); };
  const dots = (n, r, d) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, d, 0, TAU);
      ctx.fill();
    }
  };
  const petals = (n, r0, r1, w) => {
    const span = r1 - r0;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * TAU);
      ctx.beginPath();
      ctx.moveTo(0, -r0);
      ctx.bezierCurveTo(w, -(r0 + span * 0.35), w * 0.8, -(r0 + span * 0.8), 0, -r1);
      ctx.bezierCurveTo(-w * 0.8, -(r0 + span * 0.8), -w, -(r0 + span * 0.35), 0, -r0);
      ctx.stroke();
      ctx.restore();
    }
  };

  circle(R * 0.99);
  circle(R * 0.95);
  dots(72, R * 0.97, lw * 0.9);
  petals(36, R * 0.70, R * 0.93, R * 0.045);
  petals(24, R * 0.52, R * 0.80, R * 0.075);
  circle(R * 0.52);
  dots(32, R * 0.50, lw * 0.9);
  petals(16, R * 0.34, R * 0.58, R * 0.085);
  petals(12, R * 0.18, R * 0.38, R * 0.07);
  circle(R * 0.18);
  dots(12, R * 0.13, lw * 1.2);
  petals(8, 0, R * 0.14, R * 0.05);
  ctx.restore();
}

// ─── Toran ────────────────────────────────────────────────────────────────────

/** A marigold-and-mango-leaf toran across a canvas of width w, rope at y0. */
export function toran(ctx, w, y0, scale = 1, rand = seeded(5)) {
  const n = Math.max(6, Math.round(w / (92 * scale)));
  const seg = w / n;
  const sag = 28 * scale;
  ctx.save();
  ctx.strokeStyle = '#ffcf5a';
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * seg, y0);
    ctx.quadraticCurveTo((i + 0.5) * seg, y0 + sag, (i + 1) * seg, y0);
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * seg;
    const y = y0 + sag / 2;              // lowest point of the rope
    const kind = i % 3;
    ctx.strokeStyle = '#d9a21b';
    ctx.lineWidth = 2 * scale;
    const len = (kind === 2 ? 44 : 66 + (i % 2) * 14) * scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len * 0.6);
    ctx.stroke();
    if (kind === 0) {
      leaf(ctx, x, y + 6 * scale, 40 * scale, Math.PI / 2 - 0.4, GREENS[0]);
      leaf(ctx, x, y + 6 * scale, 40 * scale, Math.PI / 2 + 0.4, GREENS[2]);
      marigold(ctx, x, y + len * 0.6 + 16 * scale, 20 * scale, rand);
    } else if (kind === 1) {
      for (let k = 0; k < 3; k++) marigold(ctx, x, y + 14 * scale + k * 22 * scale, (11 + k * 1.5) * scale, rand);
    } else {
      leaf(ctx, x, y + 2 * scale, len, Math.PI / 2, GREENS[1]);
    }
  }
  ctx.restore();
}

// ─── Sparkles ─────────────────────────────────────────────────────────────────

/** A four-point twinkle star. */
export function twinkle(ctx, x, y, r, colour = '#ffe29a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0);
  ctx.quadraticCurveTo(r * 0.14, r * 0.14, 0, r);
  ctx.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0);
  ctx.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r);
  ctx.fill();
  ctx.restore();
}
