/* ==========================================================================
   MyNeedUrban — diwali-art.js
   Every Diwali illustration, drawn as small vector graphics (SVG strings), so
   there is nothing heavy to download: diyas, hanging lanterns, the rangoli
   mandala, the marigold garland, the cursor.

   Gradients live in one hidden sprite (see sprite()) and are referenced by id,
   so the same drawing can appear many times on the page.
   ========================================================================== */

const TAU = Math.PI * 2;
const f1 = (n) => Number(n.toFixed(1));

/** One hidden <svg> holding the gradients every drawing below uses. Add it to the page once. */
export function sprite() {
  return `<svg class="dw-sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute" xmlns="http://www.w3.org/2000/svg"><defs>
    <radialGradient id="dwGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffd37a" stop-opacity=".62"/><stop offset=".55" stop-color="#ff9a1a" stop-opacity=".2"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dwBowl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2733a"/><stop offset=".55" stop-color="#c25522"/><stop offset="1" stop-color="#8a3510"/>
    </linearGradient>
    <linearGradient id="dwFlame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff7a18"/><stop offset=".5" stop-color="#ffb52e"/><stop offset="1" stop-color="#ffe9a0"/>
    </linearGradient>
    <linearGradient id="dwGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#ffc83a"/><stop offset="1" stop-color="#d98a0a"/>
    </linearGradient>
    <radialGradient id="dwLamp" cx="50%" cy="58%" r="60%">
      <stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd25c" stop-opacity=".95"/><stop offset="1" stop-color="#ff7a18" stop-opacity=".25"/>
    </radialGradient>
    <linearGradient id="dwLanternR" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b3122f"/><stop offset=".5" stop-color="#ff5a3c"/><stop offset="1" stop-color="#b3122f"/>
    </linearGradient>
    <linearGradient id="dwLanternB" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1b3a9a"/><stop offset=".5" stop-color="#4fa3ff"/><stop offset="1" stop-color="#1b3a9a"/>
    </linearGradient>
    <linearGradient id="dwLanternP" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8b1260"/><stop offset=".5" stop-color="#ff5fa2"/><stop offset="1" stop-color="#8b1260"/>
    </linearGradient>
  </defs></svg>`;
}

// ─── Diya ─────────────────────────────────────────────────────────────────────
/**
 * A clay diya. `lit` shows the flame; `ledge` wraps the flame so it can be lit on tap
 * (css/diwali.css: .dw-diya .flame). `tint` is the colour of the painted band.
 */
export function diya({ lit = true, tint = '#ffc83a', ledge = false } = {}) {
  const flame = `<g class="flame"><g class="dw-flame">
      <path d="M30 2C40 15 39 28 30 34 21 28 20 15 30 2Z" fill="url(#dwFlame)"/>
      <path d="M30 13C35 20 34 27 30 31 26 27 25 20 30 13Z" fill="#fff6c8"/></g></g>`;
  return `<svg viewBox="0 0 60 68" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <circle class="halo" cx="30" cy="24" r="29" fill="url(#dwGlow)"${ledge || !lit ? '' : ' style="opacity:1"'}/>
    <path d="M3 40C3 55 15 64 30 64S57 55 57 40Z" fill="url(#dwBowl)"/>
    <path d="M3 40C3 55 15 64 30 64S57 55 57 40Z" fill="none" stroke="rgba(50,12,0,.4)" stroke-width="1.2"/>
    <path d="M9 48C14 57 22 60 30 60S46 57 51 48" fill="none" stroke="${tint}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="14" cy="53" r="1.3" fill="${tint}"/><circle cx="30" cy="59" r="1.3" fill="${tint}"/><circle cx="46" cy="53" r="1.3" fill="${tint}"/>
    <ellipse cx="30" cy="40" rx="27" ry="6.4" fill="#4a1805"/>
    <ellipse cx="30" cy="39.4" rx="21.5" ry="4.2" fill="${lit || ledge ? '#ffcf70' : '#2d1004'}"/>
    <rect x="29" y="30" width="2" height="9" rx="1" fill="#2b1204"/>
    ${lit || ledge ? flame : ''}
  </svg>`;
}

// ─── Hanging lantern (akash kandil) ───────────────────────────────────────────
/** A hanging paper lantern with tassels. `colour` is 'r' (red), 'b' (blue) or 'p' (pink). */
export function lantern({ colour = 'r' } = {}) {
  const grad = { r: 'dwLanternR', b: 'dwLanternB', p: 'dwLanternP' }[colour] || 'dwLanternR';
  return `<svg viewBox="0 0 60 132" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <line x1="30" y1="0" x2="30" y2="20" stroke="#e7b84a" stroke-width="1.6"/>
    <circle cx="30" cy="22" r="3.2" fill="url(#dwGold)"/>
    <path d="M22 26h16l5 8H17z" fill="url(#dwGold)"/>
    <path d="M17 34h26l11 30-11 30H17L6 64z" fill="url(#${grad})"/>
    <ellipse cx="30" cy="64" rx="13" ry="22" fill="url(#dwLamp)"/>
    <g stroke="rgba(60,10,0,.3)" stroke-width="1.1" fill="none"><path d="M24 34 17 64l7 30"/><path d="M36 34l7 30-7 30"/><path d="M30 34v60"/></g>
    <path d="M17 34h26M17 94h26" stroke="#ffd36b" stroke-width="2.2"/>
    <path d="M17 94h26l-5 7H22z" fill="url(#dwGold)"/>
    <g stroke="#ffd36b" stroke-width="1.4" stroke-linecap="round"><path d="M24 101v14M30 101v20M36 101v14"/></g>
    <circle cx="24" cy="117" r="2.6" fill="#ffc83a"/><circle cx="30" cy="123" r="3" fill="#ffc83a"/><circle cx="36" cy="117" r="2.6" fill="#ffc83a"/>
  </svg>`;
}

// ─── Rangoli mandala (line art, slowly turns in the hero) ─────────────────────
export function rangoli({ stroke = '#ffc83a' } = {}) {
  const parts = [];
  const ring = (n, r, rx, ry, rot = 0, fill = 'none') => {
    for (let i = 0; i < n; i++) {
      const a = (i * 360) / n + rot;
      parts.push(`<ellipse cx="${r}" cy="0" rx="${rx}" ry="${ry}" transform="rotate(${f1(a)})" fill="${fill}"/>`);
    }
  };
  const petal = (n, r0, r1, w, rot = 0) => {                       // pointed lotus petals
    for (let i = 0; i < n; i++) {
      const a = (i * 360) / n + rot;
      parts.push(`<path d="M${r0} 0C${r0 + (r1 - r0) * 0.35} ${-w} ${r1 - 6} ${-w * 0.6} ${r1} 0 ${r1 - 6} ${w * 0.6} ${r0 + (r1 - r0) * 0.35} ${w} ${r0} 0Z" transform="rotate(${f1(a)})"/>`);
    }
  };
  const dots = (n, r, size, rot = 0) => {
    for (let i = 0; i < n; i++) {
      const a = ((i * 360) / n + rot) * (Math.PI / 180);
      parts.push(`<circle cx="${f1(Math.cos(a) * r)}" cy="${f1(Math.sin(a) * r)}" r="${size}" fill="${stroke}" stroke="none"/>`);
    }
  };
  parts.push('<circle r="97" stroke-dasharray="1.5 4"/><circle r="92"/><circle r="62"/><circle r="32"/><circle r="12"/>');
  petal(24, 64, 91, 7.5);
  petal(12, 33, 61, 9, 15);
  petal(8, 13, 31, 8, 0);
  ring(24, 79, 4.5, 1.8, 7.5);
  dots(48, 94.5, 1.1);
  dots(24, 49, 1.5, 7.5);
  dots(12, 22, 1.3);
  return `<svg viewBox="-100 -100 200 200" fill="none" stroke="${stroke}" stroke-width=".9" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

// ─── Marigold bloom and cluster ───────────────────────────────────────────────
function bloom(cx, cy, r, c1 = '#ff8a00', c2 = '#ffb52e', c3 = '#ffd45e') {
  let s = `<g transform="translate(${f1(cx)} ${f1(cy)})">`;
  const ringOf = (n, rr, pr, fill, off = 0) => {
    for (let i = 0; i < n; i++) {
      const a = ((i * 360) / n + off) * (Math.PI / 180);
      s += `<circle cx="${f1(Math.cos(a) * rr)}" cy="${f1(Math.sin(a) * rr)}" r="${f1(pr)}" fill="${fill}"/>`;
    }
  };
  ringOf(10, r * 0.62, r * 0.42, c1);
  ringOf(8, r * 0.4, r * 0.34, c2, 14);
  ringOf(5, r * 0.18, r * 0.24, c3, 6);
  s += `<circle r="${f1(r * 0.1)}" fill="#a64400"/></g>`;
  return s;
}

/** The corner piece of the notice card: marigolds, leaves and two lit diyas. */
export function deco() {
  const leaf = (x, y, rot, s = 1) => `<path d="M0 0C9 -8 22 -8 30 0 22 8 9 8 0 0Z" fill="#2f9e4f" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"/>`;
  return `<svg viewBox="0 0 210 150" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <circle cx="120" cy="104" r="62" fill="url(#dwGlow)"/>
    ${leaf(150, 118, -150)}${leaf(132, 128, 200, .9)}${leaf(176, 96, -60, .9)}${leaf(108, 112, 160, .8)}
    ${bloom(170, 118, 24)}${bloom(138, 132, 19, '#ff7a00', '#ffa31a', '#ffd45e')}${bloom(190, 84, 17, '#ff9a1a', '#ffbf3a', '#ffe08a')}
    ${bloom(112, 120, 15, '#ff8a00', '#ffb52e', '#ffd45e')}${bloom(200, 140, 18)}
    <g transform="translate(80 70) scale(.85)">${diyaInner()}</g>
    <g transform="translate(140 98) scale(.62)">${diyaInner()}</g>
  </svg>`;
}
function diyaInner() {
  return `<circle cx="30" cy="24" r="29" fill="url(#dwGlow)"/>
    <path d="M3 40C3 55 15 64 30 64S57 55 57 40Z" fill="url(#dwBowl)"/>
    <path d="M9 48C14 57 22 60 30 60S46 57 51 48" fill="none" stroke="#ffc83a" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="30" cy="40" rx="27" ry="6.4" fill="#4a1805"/><ellipse cx="30" cy="39.4" rx="21.5" ry="4.2" fill="#ffcf70"/>
    <g class="dw-flame"><path d="M30 2C40 15 39 28 30 34 21 28 20 15 30 2Z" fill="url(#dwFlame)"/><path d="M30 13C35 20 34 27 30 31 26 27 25 20 30 13Z" fill="#fff6c8"/></g>`;
}

// ─── Tiles and cursors, as data-URIs the stylesheet picks up through variables ─
const uri = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

/** A garland of marigolds on a sagging thread, repeats sideways. */
export function garlandTile() {
  const blooms = [[22.5, 13], [67.5, 13]].map(([x, y]) => bloom(x, y, 6.2)).join('');
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="30" viewBox="0 0 90 30">
    <path d="M0 3Q45 14 90 3" fill="none" stroke="#c9972f" stroke-width="1.5"/>
    ${blooms}
    <path d="M45 8.5c-4 3 -4 8 0 13 4-5 4-10 0-13Z" fill="#2f9e4f"/>
    <path d="M0 3q3 3 0 7M90 3q-3 3 0 7" fill="none" stroke="#2f9e4f" stroke-width="1.4"/></svg>`);
}

/** A gold line with a small lotus in the middle, shown under section headings. */
export function ornamentTile() {
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="22" viewBox="0 0 200 22">
    <defs><linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#e7b84a" stop-opacity="0"/><stop offset="1" stop-color="#e7b84a"/></linearGradient>
    <linearGradient id="b" x1="1" x2="0"><stop offset="0" stop-color="#e7b84a" stop-opacity="0"/><stop offset="1" stop-color="#e7b84a"/></linearGradient></defs>
    <rect x="6" y="10.2" width="76" height="1.6" fill="url(#a)"/><rect x="118" y="10.2" width="76" height="1.6" fill="url(#b)"/>
    <g fill="#f5a623"><path d="M100 3c4 4 4 9 0 13-4-4-4-9 0-13Z"/><path d="M92 6c4 2 6 6 5 11-4-1-6-5-5-11Z" opacity=".85"/><path d="M108 6c-4 2-6 6-5 11 4-1 6-5 5-11Z" opacity=".85"/></g>
    <circle cx="88" cy="11" r="2" fill="#f5a623"/><circle cx="112" cy="11" r="2" fill="#f5a623"/></svg>`);
}

/** A row of tiny lit lamps for the top of the footer. */
export function diyaRowTile() {
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="46" height="30" viewBox="0 0 46 30">
    <circle cx="23" cy="12" r="12" fill="#ffb52e" opacity=".22"/>
    <path d="M5 18c0 7 8 11 18 11s18-4 18-11z" fill="#b84d1c"/><path d="M9 22c4 4 9 5 14 5s10-1 14-5" fill="none" stroke="#ffc83a" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="23" cy="18" rx="18" ry="3.4" fill="#4a1805"/>
    <path d="M23 3c5 6 5 11 0 15-5-4-5-9 0-15Z" fill="#ffb52e"/><path d="M23 9c2.6 3 2.4 5.6 0 7.6-2.4-2-2.6-4.6 0-7.6Z" fill="#fff4bf"/></svg>`);
}

/** The two mouse cursors: a lit diya, and the same diya with a brighter flame for things you can click. */
export function cursors() {
  const make = (big) => `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36">
    <defs><radialGradient id="g" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="#fff2b0" stop-opacity="${big ? '.9' : '.6'}"/><stop offset="1" stop-color="#ffb52e" stop-opacity="0"/></radialGradient></defs>
    <circle cx="15" cy="13" r="${big ? 14 : 11}" fill="url(#g)"/>
    <path d="M15 1c5 7 5 12 0 16-5-4-5-9 0-16Z" fill="#ffb52e" stroke="#b8560a" stroke-width=".7"/>
    <path d="M15 7c2.6 3.4 2.4 6 0 8.4-2.4-2.4-2.6-5 0-8.4Z" fill="#fff4bf"/>
    <path d="M3 22c0 8 6 13 12 13s12-5 12-13z" fill="#c25522" stroke="#4a1805" stroke-width="1"/>
    <ellipse cx="15" cy="22" rx="12" ry="3.2" fill="#4a1805"/>
    <path d="M7 28c3 3.4 5.6 4.4 8 4.4s5-1 8-4.4" fill="none" stroke="#ffc83a" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  return { cur: `${uri(make(false))} 15 1, auto`, go: `${uri(make(true))} 15 1, pointer` };
}
