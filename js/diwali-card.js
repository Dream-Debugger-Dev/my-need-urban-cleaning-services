/* ==========================================================================
   MyNeedUrban — diwali-card.js
   Makes a shareable Diwali greeting card (1080 x 1350 JPEG, a 4:5 portrait that
   fits WhatsApp status, Instagram and Facebook) and shows it in a dialog with
   Share and Save buttons. The visitor can type their name for a personal
   "With love from ... & family" line.

   Everything is drawn on a canvas in the browser: nothing is uploaded and
   nothing about the visitor is collected. Loaded only when someone taps
   "Make a Diwali greeting".
   ========================================================================== */

const W = 1080;
const H = 1350;
const SCRIPT = '"Yellowtail", "DM Serif Display", Georgia, serif';
const SERIF = '"DM Serif Display", Georgia, serif';
const SANS = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
// Telugu and Devanagari come from the device's own fonts
const INDIC = '"Plus Jakarta Sans", "Nirmala UI", "Noto Sans Telugu", "Noto Sans Devanagari", "Gautami", system-ui, sans-serif';

const BASE = new URL('../', import.meta.url).href;
const loadImage = (src) => new Promise((res) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => res(null);                              // the card still works without a photo
  i.src = src;
});

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

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

/** Draw `img` to fill the box (object-fit: cover), into a new canvas faded out at the top or bottom. */
function photoLayer(img, w, h, fade) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const k = Math.max(w / img.width, h / img.height);
  x.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
  x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, 0, 0, h);
  if (fade === 'bottom') { g.addColorStop(0, '#000'); g.addColorStop(0.55, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
  else { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,.8)'); g.addColorStop(1, '#000'); }
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

// ─── Small drawings ───────────────────────────────────────────────────────────
const BOWL = new Path2D('M3 40C3 55 15 64 30 64S57 55 57 40Z');
const BAND = new Path2D('M9 48C14 57 22 60 30 60S46 57 51 48');
const FLAME = new Path2D('M30 2C40 15 39 28 30 34 21 28 20 15 30 2Z');
const FLAME_IN = new Path2D('M30 13C35 20 34 27 30 31 26 27 25 20 30 13Z');

function diya(x, cx, cy, s, tint = '#ffc83a') {
  x.save();
  x.translate(cx - 30 * s, cy - 34 * s);
  x.scale(s, s);
  let g = x.createRadialGradient(30, 24, 2, 30, 24, 34);
  g.addColorStop(0, 'rgba(255,211,122,.7)'); g.addColorStop(0.5, 'rgba(255,154,26,.24)'); g.addColorStop(1, 'rgba(255,138,0,0)');
  x.fillStyle = g; x.fillRect(-20, -22, 100, 100);
  g = x.createLinearGradient(0, 40, 0, 64);
  g.addColorStop(0, '#e2733a'); g.addColorStop(0.55, '#c25522'); g.addColorStop(1, '#8a3510');
  x.fillStyle = g; x.fill(BOWL);
  x.lineWidth = 1.2; x.strokeStyle = 'rgba(50,12,0,.4)'; x.stroke(BOWL);
  x.lineWidth = 2.6; x.lineCap = 'round'; x.strokeStyle = tint; x.stroke(BAND);
  x.fillStyle = tint;
  for (const [px, py] of [[14, 53], [30, 59], [46, 53]]) { x.beginPath(); x.arc(px, py, 1.3, 0, 7); x.fill(); }
  x.fillStyle = '#4a1805'; x.beginPath(); x.ellipse(30, 40, 27, 6.4, 0, 0, 7); x.fill();
  x.fillStyle = '#ffcf70'; x.beginPath(); x.ellipse(30, 39.4, 21.5, 4.2, 0, 0, 7); x.fill();
  x.fillStyle = '#2b1204'; x.fillRect(29, 30, 2, 9);
  g = x.createLinearGradient(0, 34, 0, 2);
  g.addColorStop(0, '#ff7a18'); g.addColorStop(0.5, '#ffb52e'); g.addColorStop(1, '#ffe9a0');
  x.fillStyle = g; x.fill(FLAME);
  x.fillStyle = '#fff6c8'; x.fill(FLAME_IN);
  x.restore();
}

function marigold(x, cx, cy, r, rand) {
  const ring = (n, rr, pr, fill, off) => {
    x.fillStyle = fill;
    for (let i = 0; i < n; i++) { const a = ((i * 360) / n + off) * (Math.PI / 180); x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, pr, 0, 7); x.fill(); }
  };
  const warm = rand() < 0.5;
  ring(10, r * 0.62, r * 0.42, warm ? '#ff8a00' : '#ff9a1a', 0);
  ring(8, r * 0.4, r * 0.34, warm ? '#ffb52e' : '#ffbf3a', 14);
  ring(5, r * 0.18, r * 0.24, '#ffd45e', 6);
  x.fillStyle = '#a64400'; x.beginPath(); x.arc(cx, cy, r * 0.1, 0, 7); x.fill();
}

function leaf(x, cx, cy, len, rot, fill) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = fill; x.beginPath(); x.moveTo(0, 0);
  x.bezierCurveTo(len * 0.3, -len * 0.27, len * 0.73, -len * 0.27, len, 0);
  x.bezierCurveTo(len * 0.73, len * 0.27, len * 0.3, len * 0.27, 0, 0);
  x.fill(); x.restore();
}

function sparkle(x, cx, cy, r, fill) {
  const t = r * 0.26;
  x.fillStyle = fill; x.beginPath();
  x.moveTo(cx, cy - r); x.lineTo(cx + t, cy - t); x.lineTo(cx + r, cy); x.lineTo(cx + t, cy + t);
  x.lineTo(cx, cy + r); x.lineTo(cx - t, cy + t); x.lineTo(cx - r, cy); x.lineTo(cx - t, cy - t); x.closePath(); x.fill();
}

function firework(x, cx, cy, R, color, rand, spokes = 26) {
  x.lineCap = 'round';
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rand() * 0.08;
    const r0 = R * (0.18 + rand() * 0.1), r1 = R * (0.8 + rand() * 0.2);
    const g = x.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.strokeStyle = g; x.lineWidth = 3 + rand() * 2.2;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.stroke();
    x.fillStyle = color; x.beginPath(); x.arc(cx + Math.cos(a) * r1 * 1.06, cy + Math.sin(a) * r1 * 1.06, 2.4 + rand() * 2, 0, 7); x.fill();
  }
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.34);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 0.34, 0, 7); x.fill();
}

// ─── The card ─────────────────────────────────────────────────────────────────
export async function render({ name = '' } = {}) {
  await Promise.all([
    document.fonts.load(`400 100px ${SCRIPT}`),
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`800 40px ${SANS}`),
    document.fonts.load(`500 36px ${SANS}`),
  ].map((p) => p.catch(() => {})));
  const [logo, sky, row] = await Promise.all([
    loadImage(`${BASE}assets/logo/MyNeedUrban_logo_v3.png`),
    loadImage(`${BASE}assets/images/diwali/lanterns-sky.webp`),
    loadImage(`${BASE}assets/images/diwali/diyas-row.webp`),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d');
  const rand = seeded(2026);

  // Night sky, with a sky full of lanterns above and a row of lit diyas below
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050a1c'); bg.addColorStop(0.5, '#0d1850'); bg.addColorStop(1, '#2a1450');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  if (sky) { x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.85; x.drawImage(photoLayer(sky, W, 820, 'bottom'), 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
  if (row) { x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.5; x.drawImage(photoLayer(row, W, 560, 'top'), 0, H - 560); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
  let g = x.createRadialGradient(W / 2, 880, 30, W / 2, 880, 620);
  g.addColorStop(0, 'rgba(255,150,30,.42)'); g.addColorStop(1, 'rgba(255,150,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  for (let i = 0; i < 70; i++) sparkle(x, 50 + rand() * (W - 100), 40 + rand() * 640, 2 + rand() * 6, `rgba(255,236,190,${0.25 + rand() * 0.6})`);
  x.globalCompositeOperation = 'lighter';
  firework(x, 170, 230, 150, '#ffd45e', rand);
  firework(x, 905, 190, 130, '#ff4f93', rand, 22);
  firework(x, 880, 520, 105, '#4fc3ff', rand, 20);
  firework(x, 205, 540, 95, '#ff8a00', rand, 20);
  x.globalCompositeOperation = 'source-over';

  // Frame
  x.strokeStyle = 'rgba(255,200,60,.8)'; x.lineWidth = 3.5; roundRect(x, 26, 26, W - 52, H - 52, 38); x.stroke();
  x.strokeStyle = 'rgba(255,200,60,.3)'; x.lineWidth = 1.5; roundRect(x, 44, 44, W - 88, H - 88, 28); x.stroke();

  // Headline
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const tg = x.createLinearGradient(0, 230, 0, 380);
  tg.addColorStop(0, '#fff3c4'); tg.addColorStop(0.5, '#ffc83a'); tg.addColorStop(1, '#ff9a1a');
  fitFont(x, 'Happy Diwali', SCRIPT, 400, 200, 110, W - 150);
  x.fillStyle = tg; x.shadowColor = 'rgba(255,150,20,.55)'; x.shadowBlur = 34;
  x.fillText('Happy Diwali', W / 2, 340);
  x.shadowBlur = 0;
  x.fillStyle = '#ffe8b0';
  let ly = 408;
  for (const line of ['దీపావళి శుభాకాంక్షలు', 'दीपावली की हार्दिक शुभकामनाएँ']) {
    fitFont(x, line, INDIC, 700, 46, 28, W - 200);
    x.fillText(line, W / 2, ly);
    ly += 58;
  }

  // The centrepiece: a great diya inside a rangoli of dots, petals and marigolds
  const cx = W / 2, cy = 800;
  x.strokeStyle = 'rgba(255,200,60,.55)';
  x.setLineDash([2, 12]); x.lineWidth = 4; x.lineCap = 'round';
  for (const r of [262, 300]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
  x.setLineDash([]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    leaf(x, cx + Math.cos(a) * 190, cy + Math.sin(a) * 190, 86, a, i % 2 ? 'rgba(47,158,79,.92)' : 'rgba(35,128,63,.92)');
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    marigold(x, cx + Math.cos(a) * 262, cy + Math.sin(a) * 262, 34, rand);
  }
  diya(x, cx, cy + 22, 4.1);
  for (const [dx, dy, s] of [[-390, 40, 1.5], [390, 40, 1.5], [-330, -150, 1.1], [330, -150, 1.1]]) diya(x, cx + dx, cy + dy, s, '#ff8a1f');

  // Words
  x.fillStyle = '#e8eefc'; x.font = `600 38px ${SANS}`;
  const wish = 'Wishing you light, joy and prosperity, and a home that shines.';
  wrap(x, wish, 760).slice(0, 2).forEach((t, i) => x.fillText(t, W / 2, 1104 + i * 48));
  const who = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  x.fillStyle = tg;
  if (who) {
    const line = `With love from ${who} & family`;
    fitFont(x, line, SCRIPT, 400, 64, 34, W - 200);
    x.fillText(line, W / 2, 1198);
  } else {
    fitFont(x, 'Clean Home, Happy Home', SCRIPT, 400, 64, 34, W - 200);
    x.fillText('Clean Home, Happy Home', W / 2, 1198);
  }

  // Brand band
  const BY = H - 128;
  roundRect(x, 78, BY, W - 156, 82, 26); x.fillStyle = 'rgba(255,255,255,.09)'; x.fill();
  x.strokeStyle = 'rgba(255,200,60,.35)'; x.lineWidth = 1.5; x.stroke();
  if (logo) x.drawImage(logo, 96, BY + 6, 70, 70);
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = `800 30px ${SANS}`;
  x.fillText('MyNeedUrban Cleaning Services', 184, BY + 38);
  x.fillStyle = '#a9b8d4'; x.font = `600 23px ${SANS}`;
  x.fillText('Hyderabad  ·  www.myneedurban.com', 184, BY + 68);
  x.textAlign = 'right'; x.fillStyle = '#ffc83a'; x.font = `800 30px ${SANS}`;
  x.fillText('96133 04724', W - 100, BY + 52);
  return canvas;
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
export async function openCard({ opener } = {}) {
  const dlg = document.createElement('div');
  dlg.className = 'dw-dialog is-open';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'dwCardTitle');
  dlg.innerHTML = `<div class="dw-card dw-card--card">
    <button type="button" class="dw-x-btn" data-act="close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    <div class="dw-card-head"><p>Diwali 2026</p><h3 id="dwCardTitle">Your greeting card</h3></div>
    <div class="dw-card-body">
      <div class="dw-card-form">
        <label for="dwCardName">Your name <span style="opacity:.7;text-transform:none;letter-spacing:0;font-weight:600">(optional)</span></label>
        <input id="dwCardName" type="text" maxlength="28" autocomplete="given-name" placeholder="e.g. Sharma" />
      </div>
      <div class="dw-card-stage" aria-live="polite"><p style="margin:24px 0">Creating your card…</p></div>
      <div class="dw-card-row">
        <a class="btn dw-gold-btn" data-act="download" download="myneedurban-happy-diwali.jpg" hidden><i class="fa-solid fa-download" aria-hidden="true"></i> Save card</a>
        <button type="button" class="btn dw-ghost-btn" data-act="share" hidden><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share</button>
      </div>
      <p style="margin:12px 0 0;font-size:.8rem;opacity:.75">Made on your phone. Nothing is uploaded.</p>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  document.documentElement.classList.add('dw-lock');

  const stage = dlg.querySelector('.dw-card-stage');
  const dl = dlg.querySelector('[data-act="download"]');
  const sh = dlg.querySelector('[data-act="share"]');
  const nameBox = dlg.querySelector('#dwCardName');
  let url = '';
  let file = null;
  let seq = 0;
  let timer = 0;

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('dw-lock');
    clearTimeout(timer);
    seq++;
    if (url) URL.revokeObjectURL(url);
    dlg.remove();
    if (opener && document.body.contains(opener)) opener.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('button:not([hidden]), a[href]:not([hidden]), input')].filter((n) => !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-act="close"]')) close(); });

  async function draw() {
    const mine = ++seq;
    try {
      const canvas = await render({ name: nameBox.value });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('could not encode the card');
      if (mine !== seq) return;                                       // a newer draw (or closing) took over
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      img.alt = 'A Happy Diwali greeting card from MyNeedUrban Cleaning Services';
      img.className = 'dw-card-img';
      stage.replaceChildren(img);
      dl.href = url; dl.hidden = false;
      file = new File([blob], 'myneedurban-happy-diwali.jpg', { type: 'image/jpeg' });
      sh.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (err) {
      console.warn('[diwali] card failed', err);
      stage.innerHTML = '<p style="margin:18px 0">Sorry, we could not make the card on this device. You can still tap “Share the wishes” in the footer.</p>';
    }
  }
  nameBox.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 380); });
  sh.addEventListener('click', async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], title: 'Happy Diwali', text: 'Happy Diwali! From MyNeedUrban Cleaning Services, Hyderabad' }); }
    catch (err) { if (err && err.name !== 'AbortError') console.warn('[diwali] share failed', err); }
  });
  nameBox.focus({ preventScroll: true });
  await draw();
}
