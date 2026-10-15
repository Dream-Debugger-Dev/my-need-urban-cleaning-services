/* ==========================================================================
   MyNeedUrban — festival-card.js
   Draws a shareable festival greeting card (1080 x 1350 JPEG, a 4:5 portrait
   that fits WhatsApp, Instagram and Facebook) and shows it in a small dialog with
   Share and Download buttons. Loaded only when someone taps "Greeting card".
   Everything is drawn on a canvas in the browser: nothing is uploaded, and
   nothing about the visitor is collected.
   ========================================================================== */
import * as A from './festival-art.js?v=20261014b';

const W = 1080;
const H = 1350;
const SERIF = '"DM Serif Display", Georgia, serif';
const SANS = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
// Telugu and Devanagari come from the device's own fonts
const INDIC = '"Plus Jakarta Sans", "Nirmala UI", "Noto Sans Telugu", "Noto Sans Devanagari", "Gautami", system-ui, sans-serif';

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/** Largest font size (down to `min`) at which `text` fits in `maxW`. */
function fitFont(x, text, family, weight, size, min, maxW) {
  let s = size;
  do { x.font = `${weight} ${s}px ${family}`; if (x.measureText(text).width <= maxW) break; s -= 2; } while (s > min);
  return s;
}

function wrap(x, text, maxW) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? `${cur} ${word}` : word;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

async function render({ plan, copy, navratri }) {
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`800 40px ${SANS}`),
    document.fonts.load(`500 36px ${SANS}`),
  ].map((p) => p.catch(() => {})));
  const logo = await loadImage(new URL('../assets/logo/MyNeedUrban_logo_v3.png', import.meta.url).href).catch(() => null);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const x = canvas.getContext('2d');
  const day = plan.nav || navratri[0];                       // outside the nine nights: festive orange
  const [dr, dg, db] = rgb(day.hex);
  const rand = A.seeded(2026);

  // Background: deep night sky, the day's colour glowing behind the art, warm light from below
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a1120');
  bg.addColorStop(0.55, '#10203a');
  bg.addColorStop(1, '#1b1433');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W / 2, 800, 30, W / 2, 800, 640);
  g.addColorStop(0, `rgba(${dr},${dg},${db},.42)`);
  g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W / 2, H, 40, W / 2, H, 760);
  g.addColorStop(0, 'rgba(255,150,0,.30)');
  g.addColorStop(1, 'rgba(255,150,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  A.mandala(x, W / 2, 790, 570, 'rgba(255,196,60,.16)', 2.4);
  for (let i = 0; i < 46; i++) {
    A.twinkle(x, 60 + rand() * (W - 120), 150 + rand() * 760, 3 + rand() * 7, `rgba(255,226,154,${0.35 + rand() * 0.5})`);
  }

  // Frame
  x.strokeStyle = 'rgba(255,200,60,.65)';
  x.lineWidth = 3;
  roundRect(x, 26, 26, W - 52, H - 52, 38);
  x.stroke();
  x.strokeStyle = 'rgba(255,200,60,.25)';
  x.lineWidth = 1.5;
  roundRect(x, 42, 42, W - 84, H - 84, 28);
  x.stroke();

  A.toran(x, W, 46, 1.2, A.seeded(5));

  // Vertical rhythm (px from the top). Headline block, then the art, then the
  // chip, the blessing (up to 2 lines) and the brand band. Keep them in order:
  // title 310 -> Telugu 376 -> Hindi 432 | art 470-1000 | chip 1006-1078 |
  // blessing 1130-1176 | brand band 1210-1296.
  const BAND_Y = H - 140;
  const BAND_H = 86;

  // Headline
  const tg = x.createLinearGradient(0, 215, 0, 320);
  tg.addColorStop(0, '#fff0b8');
  tg.addColorStop(0.5, '#ffc83a');
  tg.addColorStop(1, '#ff9a1a');
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  fitFont(x, copy.title, SERIF, 400, 124, 70, W - 170);
  x.fillStyle = tg;
  x.shadowColor = 'rgba(0,0,0,.35)';
  x.shadowBlur = 18;
  x.fillText(copy.title, W / 2, 310);
  x.shadowBlur = 0;

  // Telugu and Hindi lines (first of each that this day has)
  const te = copy.lines.find(([l]) => l === 'te');
  const hi = copy.lines.find(([l]) => l === 'hi');
  let ly = 376;
  x.fillStyle = '#ffe8b0';
  for (const line of [te, hi]) {
    if (!line) continue;
    fitFont(x, line[1], INDIC, 700, 46, 28, W - 190);
    x.fillText(line[1], W / 2, ly);
    ly += 56;
  }

  // Art
  if (plan.phase === 'dasara') {
    // A wreath of marigolds around a great diya
    const cx = W / 2, cy = 765, R = 200;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      A.leaf(x, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 58, a + Math.PI / 2 + 0.5, '#2f9e4f');
      A.leaf(x, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 58, a + Math.PI / 2 - 0.5, '#23803f');
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      A.marigold(x, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 34, rand);
    }
    A.diya(x, cx, cy + 34, 3.6, { lit: true, tint: '#ffc83a' });
  } else {
    A.bathukamma(x, W / 2, 935, 440, A.seeded(11));
    A.diya(x, 190, 905, 1.7, { lit: true, tint: day.hex });
    A.diya(x, W - 190, 905, 1.7, { lit: true, tint: day.hex });
  }

  // Colour-of-the-day chip
  let chip = '';
  if (plan.phase === 'navratri') chip = `Night ${plan.nav.n} of 9  ·  ${plan.nav.colour}  ·  Maa ${plan.nav.devi}`;
  else if (plan.phase === 'prelude') chip = 'Bathukamma begins  ·  Navratri starts tomorrow';
  else if (plan.phase === 'dasara') chip = 'Tuesday, 20 October 2026';
  if (chip) {
    x.font = `700 33px ${SANS}`;
    const hasDot = plan.phase === 'navratri';
    const pw = x.measureText(chip).width + (hasDot ? 120 : 80);
    const px = (W - pw) / 2;
    const py = 1006;
    roundRect(x, px, py, pw, 72, 36);
    x.fillStyle = 'rgba(255,255,255,.09)';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.28)';
    x.lineWidth = 2;
    x.stroke();
    if (hasDot) {
      x.beginPath();
      x.arc(px + 50, py + 36, 17, 0, Math.PI * 2);
      x.fillStyle = day.hex;
      x.fill();
      x.strokeStyle = '#fff';
      x.lineWidth = 3;
      x.stroke();
    }
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.fillText(chip, px + (hasDot ? 86 : 40), py + 47);
    x.textAlign = 'center';
  }

  // Blessing (one or two lines, always above the brand band)
  x.font = `500 35px ${SANS}`;
  x.fillStyle = '#d6e0f0';
  const lines = wrap(x, copy.blessing, 800).slice(0, 2);
  lines.forEach((t, i) => x.fillText(t, W / 2, 1130 + i * 46));

  // Brand band
  roundRect(x, 78, BAND_Y, W - 156, BAND_H, 26);
  x.fillStyle = 'rgba(255,255,255,.07)';
  x.fill();
  if (logo) x.drawImage(logo, 98, BAND_Y + 8, 70, 70);
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = `800 31px ${SANS}`;
  x.fillText('MyNeedUrban Cleaning Services', 190, BAND_Y + 38);
  x.fillStyle = '#9fb3cc';
  x.font = `600 24px ${SANS}`;
  x.fillText('Hyderabad  ·  www.myneedurban.com', 190, BAND_Y + 68);
  x.textAlign = 'right';
  x.fillStyle = '#ffc83a';
  x.font = `800 30px ${SANS}`;
  x.fillText('96133 04724', W - 100, BAND_Y + 52);

  return canvas;
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
export async function openCard({ plan, copy, navratri, opener }) {
  const name = plan.phase === 'dasara' ? 'vijayadashami'
    : plan.nav ? `navratri-night-${plan.nav.n}` : 'bathukamma';
  // JPEG, not PNG: this card is smooth gradients, so JPEG is about a third of the
  // size (good for WhatsApp on mobile data) and encodes ~10x faster.
  const file = `myneedurban-${name}.jpg`;

  const dlg = document.createElement('div');
  dlg.className = 'fest-modal';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'festCardTitle');
  dlg.innerHTML = `<div class="fest-modal-box">
    <button type="button" class="fest-x" data-act="close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    <h3 id="festCardTitle">Your greeting card</h3>
    <div class="fest-card-stage" aria-live="polite"><div class="fest-spin" role="status">Creating your card…</div></div>
    <div class="fest-modal-actions">
      <a class="btn fest-cta" data-act="download" download="${file}" hidden><i class="fa-solid fa-download" aria-hidden="true"></i> Save card</a>
      <button type="button" class="btn fest-ghost" data-act="share" hidden><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share</button>
    </div>
    <p class="fest-modal-note">Made on your phone. Nothing is uploaded.</p>
  </div>`;
  document.body.appendChild(dlg);
  document.documentElement.classList.add('fest-lock');

  let url = '';
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('fest-lock');
    if (url) URL.revokeObjectURL(url);
    dlg.remove();
    if (opener && document.body.contains(opener)) opener.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('button:not([hidden]), a[href]:not([hidden])')].filter((n) => !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-act="close"]')) close(); });
  dlg.querySelector('[data-act="close"]').focus();

  try {
    const canvas = await render({ plan, copy, navratri });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) throw new Error('could not encode the card');
    if (!document.body.contains(dlg)) return;                       // closed while drawing
    url = URL.createObjectURL(blob);

    const img = new Image();
    img.src = url;
    img.alt = `${copy.title} greeting card from MyNeedUrban Cleaning Services`;
    img.className = 'fest-card-img';
    dlg.querySelector('.fest-card-stage').replaceChildren(img);

    const dl = dlg.querySelector('[data-act="download"]');
    dl.href = url;
    dl.hidden = false;

    const fileObj = new File([blob], file, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
      const sh = dlg.querySelector('[data-act="share"]');
      sh.hidden = false;
      sh.addEventListener('click', async () => {
        try { await navigator.share({ files: [fileObj], title: copy.title, text: copy.share }); }
        catch (err) { if (err && err.name !== 'AbortError') console.warn('[festival] share failed', err); }
      });
    }
  } catch (err) {
    console.warn('[festival] card failed', err);
    dlg.querySelector('.fest-card-stage').innerHTML = '<p class="fest-err">Sorry, we could not make the card on this device. You can still tap “Share wishes”.</p>';
  }
}
