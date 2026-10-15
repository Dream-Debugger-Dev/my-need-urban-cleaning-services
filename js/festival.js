/* ==========================================================================
   MyNeedUrban — festival.js
   Seasonal layer for Navratri · Bathukamma · Dasara 2026.

   - Self-expiring. It switches itself on for 10–21 October 2026 (India time)
     and does nothing on any other day: no styles, no extra requests, no DOM
     changes. Nothing needs deploying to turn it off.
   - Adds, on the home page only: a marigold toran over the hero, a drifting
     petal scene and slow rangoli mandala, a festive card with the nine
     Navratri nights lit one by one in each day's colour, today's Bathukamma,
     a Dasara countdown, a "book a festive deep clean" button, a shareable
     greeting card, and a festive line in the footer.
   - Preview any day:  ?fest=2026-10-19     Switch off:  ?fest=off
   - To remove it for good: delete css/festival.css and js/festival*.js. Then
     in index.html delete the festival-boot.js <script> line (in <head>), the
     <div id="festSlot"> and the festival.js <script> line, and in css/app.css
     delete the "Festival slot" block at the end.

   Calendar notes: panchangs differ by a day between regions. The tables just
   below are the only place the dates live, so they are a one-line edit.
   ========================================================================== */

// ─── Calendar (India dates) ───────────────────────────────────────────────────
// SEASON and DASARA are repeated in js/festival-boot.js, which runs in <head>
// and reserves the card's space before the first paint. If you change a date
// here, change it in that file too.
const SEASON = { from: '2026-10-10', to: '2026-10-21' };   // inclusive
const DASARA = '2026-10-20';                                // Vijayadashami

// The nine colours of Sharad Navratri 2026, one per night.
const NAVRATRI = [
  { n: 1, date: '2026-10-11', devi: 'Shailputri',    colour: 'Orange',        short: 'Orange',  hex: '#ff8a1f' },
  { n: 2, date: '2026-10-12', devi: 'Brahmacharini', colour: 'White',         short: 'White',   hex: '#f1f4fb' },
  { n: 3, date: '2026-10-13', devi: 'Chandraghanta', colour: 'Red',           short: 'Red',     hex: '#e5383b' },
  { n: 4, date: '2026-10-14', devi: 'Kushmanda',     colour: 'Royal Blue',    short: 'Blue',    hex: '#3b6cf5' },
  { n: 5, date: '2026-10-15', devi: 'Skandamata',    colour: 'Yellow',        short: 'Yellow',  hex: '#ffd21f' },
  { n: 6, date: '2026-10-16', devi: 'Katyayani',     colour: 'Green',         short: 'Green',   hex: '#2fb36d' },
  { n: 7, date: '2026-10-17', devi: 'Kalaratri',     colour: 'Grey',          short: 'Grey',    hex: '#9aa5b8' },
  { n: 8, date: '2026-10-18', devi: 'Mahagauri',     colour: 'Purple',        short: 'Purple',  hex: '#9b5de5' },
  { n: 9, date: '2026-10-19', devi: 'Siddhidatri',   colour: 'Peacock Green', short: 'Peacock', hex: '#14a3a3' },
];

// Telangana's flower festival: Engili Pula (10 Oct) to Saddula (18 Oct).
const BATHUKAMMA = [
  'Engili Pula', 'Atukula', 'Muddapappu', 'Nanabiyyam', 'Atla',
  'Aligina', 'Vepakayala', 'Venna Muddala', 'Saddula',
];
const BATHUKAMMA_START = '2026-10-10';

// Greetings. One Telugu and one Hindi line sit under the English headline.
const TE = {
  navratri: 'నవరాత్రి శుభాకాంక్షలు',
  navratriBathukamma: 'నవరాత్రి, బతుకమ్మ శుభాకాంక్షలు',      // "Navratri, Bathukamma greetings"
  bathukamma: 'బతుకమ్మ శుభాకాంక్షలు',
  vijayadashami: 'విజయదశమి శుభాకాంక్షలు',
};
const HI = {
  navratri: 'नवरात्रि की हार्दिक शुभकामनाएँ',
  vijayadashami: 'विजयादशमी की हार्दिक शुभकामनाएँ',
};

// ─── Versioned URLs (the ?v= must match index.html; the QA check enforces it) ──
const CSS_URL = new URL('../css/festival.css?v=20261014b', import.meta.url).href;
const ART_URL = './festival-art.js?v=20261014b';
const FX_URL = './festival-fx.js?v=20261014b';
const CARD_URL = './festival-card.js?v=20261014b';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * import() that retries. On a visitor's very first visit the page's service
 * worker installs and takes control; a module fetch that is in flight at that
 * instant can be aborted by the browser (net::ERR_ABORTED). The files are
 * fine, so a short pause and another go always succeeds. The retry URL gets an
 * extra query so a cached failure can't be replayed.
 */
async function loadModule(url) {
  let err;
  for (let i = 0; i < 3; i++) {
    try { return await import(i ? `${url}&retry=${i}` : url); }
    catch (e) { err = e; await sleep(350 * (i + 1)); }
  }
  throw err;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const dateLabel = (s) => { const d = new Date(utc(s)); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** Today's date in India as YYYY-MM-DD, or the ?fest=YYYY-MM-DD preview date. */
function today() {
  const q = new URLSearchParams(location.search).get('fest');
  if (q === 'off') return null;
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date());
  } catch (_) {
    const t = new Date(Date.now() + 5.5 * 3600000);          // UTC+5:30
    return t.toISOString().slice(0, 10);
  }
}

function planFor(date) {
  if (!date || date < SEASON.from || date > SEASON.to) return null;
  const nav = NAVRATRI.find((d) => d.date === date) || null;
  const bkIndex = daysBetween(BATHUKAMMA_START, date);
  const bk = bkIndex >= 0 && bkIndex < BATHUKAMMA.length ? { n: bkIndex + 1, name: BATHUKAMMA[bkIndex] } : null;
  const phase = date === DASARA ? 'dasara' : date > DASARA ? 'after' : nav ? 'navratri' : 'prelude';
  return { date, phase, nav, bk, left: daysBetween(date, DASARA) };
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Text colour for a label sitting on `hex`: white if it reads well (WCAG contrast >= 4.2), else near-black. */
function inkFor(hex) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgbOf(hex);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05) >= 4.2 ? '#ffffff' : '#1b1405';
}
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;

// ─── Copy for each phase ──────────────────────────────────────────────────────
function copyFor(plan) {
  const lines = [];                                  // [lang, text] shown under the headline
  let title; let blessing; let share;
  if (plan.phase === 'prelude') {
    title = 'Happy Bathukamma';
    lines.push(['te', TE.bathukamma]);
    blessing = 'May the festival of flowers fill your home with joy and good health.';
    share = '🌼 Happy Bathukamma! Wishing you and your family joy, flowers and good health.';
  } else if (plan.phase === 'navratri') {
    title = 'Shubh Navratri';
    lines.push(['te', plan.bk ? TE.navratriBathukamma : TE.navratri], ['hi', HI.navratri]);
    blessing = 'Nine nights of joy, light and good health for you and your family.';
    share = '🪔 Shubh Navratri! Wishing you and your family nine nights of joy, light and good health.';
  } else if (plan.phase === 'dasara') {
    title = 'Happy Vijayadashami';
    lines.push(['te', TE.vijayadashami], ['hi', HI.vijayadashami]);
    blessing = 'May good always win, and every home be filled with light.';
    share = '🏹 Happy Vijayadashami! May good always win, and may your home be filled with light and joy.';
  } else {
    title = 'Hope your Dasara was joyful';
    blessing = 'Diwali is just around the corner.';
    share = '';
  }
  return { title, lines, blessing, share };
}

// ─── Inline art: sprite, diya ─────────────────────────────────────────────────
function flowerSymbol() {
  const ring = (n, cx, rx, ry, fill, off = 0) => {
    let s = `<g fill="${fill}">`;
    for (let i = 0; i < n; i++) s += `<ellipse cx="${cx}" cy="0" rx="${rx}" ry="${ry}" transform="rotate(${(i * 360 / n + off).toFixed(1)})"/>`;
    return `${s}</g>`;
  };
  return `<symbol id="fest-flower" viewBox="-12 -12 24 24">
    ${ring(12, 7.2, 4.6, 2.7, '#e97500')}${ring(10, 5, 3.6, 2.3, '#ff9a1a', 10)}${ring(8, 3, 2.6, 1.7, '#ffc233')}
    <circle r="1.3" fill="#a64400"/></symbol>`;
}

function sprite() {
  const flower = (x, y, s) => `<use href="#fest-flower" xlink:href="#fest-flower" x="${x}" y="${y}" width="${s}" height="${s}"/>`;
  return `<svg class="fest-sprite" width="0" height="0" aria-hidden="true" focusable="false"
      xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>
    ${flowerSymbol()}
    <symbol id="fest-pa" viewBox="0 0 30 66">
      <line x1="15" y1="0" x2="15" y2="34" stroke="#d9a21b" stroke-width="1.4"/>
      <path d="M15 3C6 5 0 16 2 31 10 27 15 17 15 3Z" fill="#2f9e4f"/>
      <path d="M15 3C24 5 30 16 28 31 20 27 15 17 15 3Z" fill="#3fae5a"/>
      ${flower(2, 36, 26)}
    </symbol>
    <symbol id="fest-pb" viewBox="0 0 30 66">
      <line x1="15" y1="0" x2="15" y2="54" stroke="#d9a21b" stroke-width="1.4"/>
      ${flower(6, 5, 18)}${flower(4, 22, 22)}${flower(2, 41, 26)}
    </symbol>
    <symbol id="fest-pc" viewBox="0 0 30 66">
      <line x1="15" y1="0" x2="15" y2="8" stroke="#d9a21b" stroke-width="1.4"/>
      <path d="M15 6C27 20 26 45 15 64 4 45 3 20 15 6Z" fill="#23803f"/>
      <path d="M15 10 15 58" stroke="rgba(0,50,15,.4)" stroke-width="1.1" fill="none"/>
    </symbol>
  </defs></svg>`;
}

/** An inline clay diya. `lit` shows the flame; `tint` colours the band on the bowl. */
function diyaSVG({ lit = true, tint = '#ff8a1f', cls = '' } = {}) {
  return `<svg class="fest-diya ${cls}" viewBox="0 0 52 56" aria-hidden="true" focusable="false">
    ${lit ? '<circle cx="26" cy="22" r="19" fill="rgba(255,190,70,.26)"/>' : ''}
    <path d="M2 36C2 48 13 54 26 54S50 48 50 36Z" fill="#c8561d"/>
    <path d="M2 36C2 48 13 54 26 54S50 48 50 36Z" fill="none" stroke="rgba(60,15,0,.35)" stroke-width="1.2"/>
    <path d="M8 43C13 50 20 52 26 52S39 50 44 43" fill="none" stroke="${tint}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="26" cy="36" rx="24" ry="5.4" fill="#4a1805"/>
    <ellipse cx="26" cy="35.6" rx="19.5" ry="3.4" fill="${lit ? '#ffcf70' : '#2d1004'}"/>
    <rect x="25" y="28" width="2" height="8" rx="1" fill="#2b1204"/>
    ${lit ? `<g class="fd-fl"><path d="M26 4C34.5 15 33 25 26 29.5 19 25 17.5 15 26 4Z" fill="#ffb52e"/>
      <path d="M26 13C30 19 29.2 24 26 27 22.8 24 22 19 26 13Z" fill="#fff4bf"/></g>` : ''}
  </svg>`;
}

// ─── Hero decorations ─────────────────────────────────────────────────────────
function buildToran(hero) {
  hero.querySelector('.fest-toran')?.remove();
  const w = hero.clientWidth || window.innerWidth;
  const n = Math.max(5, Math.min(28, Math.round(w / (isPhone() ? 62 : 90))));
  const kinds = ['a', 'b', 'c', 'b'];                       // leaf+flower, flower string, long leaf
  let segs = '';
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length];
    const t = (3.3 + ((i * 7) % 5) * 0.28).toFixed(2);       // each pendant swings at its own pace
    const d = (-((i * 13) % 11) * 0.37).toFixed(2);
    const a = (3.4 + (i % 3) * 1.1).toFixed(1);
    segs += `<span class="fest-seg">
      <svg class="fest-rope" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 1.5Q50 15 100 1.5" fill="none" stroke="#ffcf5a" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="fest-hang" style="--t:${t}s;--d:${d}s;--a:${a}deg">
        <svg viewBox="0 0 30 66" aria-hidden="true" focusable="false"><use href="#fest-p${k}" xlink:href="#fest-p${k}"/></svg>
      </span></span>`;
  }
  const el = html(`<div class="fest-toran" aria-hidden="true" data-count="${n}">${segs}</div>`);
  hero.prepend(el);
}

function buildMedal(hero) {
  const art = hero.querySelector('.hero-art');
  if (!art) return;
  art.append(html(`<div class="fest-medal" aria-hidden="true">
    <svg class="fm-ring" viewBox="0 0 120 120" focusable="false">
      <defs><path id="festCircle" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0"/></defs>
      <circle cx="60" cy="60" r="58" fill="#0d1b2a" stroke="#ffc83a" stroke-width="2"/>
      <circle cx="60" cy="60" r="53.5" fill="none" stroke="rgba(255,200,58,.45)" stroke-width="1" stroke-dasharray="1.5 3.5"/>
      <text font-size="9.2" font-weight="800" fill="#ffd77a" letter-spacing="1.1" font-family="Plus Jakarta Sans, system-ui, sans-serif">
        <textPath href="#festCircle" xlink:href="#festCircle" textLength="276" lengthAdjust="spacing">SHUBH NAVRATRI ✦ HAPPY DASARA ✦ </textPath>
      </text>
    </svg>
    <span class="fm-diya">${diyaSVG({ lit: true, tint: '#ffc83a' })}</span>
  </div>`));
}

// ─── The festive card ─────────────────────────────────────────────────────────
function daysLine(plan) {
  if (plan.phase === 'dasara') return { n: '🏹', l: 'Dasara is today' };
  if (plan.phase === 'after') return null;
  const d = plan.left;
  return { n: String(d), l: `day${d === 1 ? '' : 's'} to Dasara` };
}

function stripHTML(plan) {
  const copy = copyFor(plan);
  const todayN = plan.nav ? plan.nav.n : (plan.phase === 'prelude' ? 0 : 99);

  const pills = [];
  if (plan.phase === 'prelude') {
    pills.push('<span class="fest-pill">Bathukamma · Day 1</span>', '<span class="fest-pill is-soft">Navratri begins tomorrow</span>');
  } else if (plan.phase === 'navratri') {
    pills.push(`<span class="fest-pill">Navratri · Day ${plan.nav.n} of 9</span>`);
    if (plan.bk) pills.push(`<span class="fest-pill is-soft">🌼 ${esc(plan.bk.name)} Bathukamma</span>`);
    if (plan.nav.n === 9) pills.push('<span class="fest-pill is-soft">Maha Navami</span>');
  } else if (plan.phase === 'dasara') {
    pills.push(`<span class="fest-pill">Vijayadashami · ${dateLabel(plan.date)}</span>`);
  } else {
    pills.push(`<span class="fest-pill is-soft">Dasara · ${dateLabel(DASARA)}</span>`);
  }

  const subs = copy.lines.map(([lang, text]) => `<span lang="${lang}">${esc(text)}</span>`).join('');

  const chips = NAVRATRI.map((d) => {
    const state = d.n < todayN ? 'is-done' : d.n === todayN ? 'is-today' : '';
    const lit = d.n <= todayN;
    const [r, g, b] = rgbOf(d.hex);
    return `<button type="button" class="fest-day ${state}" data-day="${d.n}" aria-pressed="false"
        style="--c:${d.hex};--c-rgb:${r},${g},${b}"
        aria-label="Night ${d.n}: ${esc(d.colour)}, Maa ${esc(d.devi)}, ${dateLabel(d.date)}${d.n === todayN ? ' (today)' : ''}">
      ${diyaSVG({ lit, tint: d.hex })}
      <b>${d.n}</b><small>${esc(d.short)}</small>
    </button>`;
  }).join('');

  const count = daysLine(plan);
  let pitch = 'Welcome the festive season with a spotless home.';
  if (plan.phase === 'after') pitch = 'Diwali is just around the corner. Give your home its festive deep clean.';
  else if (plan.bk && plan.bk.n === 9) pitch = 'Today is Saddula Bathukamma, the grand finale of nine days of flowers.';
  else if (plan.nav && plan.nav.n === 9) pitch = 'Maha Navami is Ayudha Puja: a day to thank the tools that keep every home sparkling.';

  return `<section class="fest-strip" id="festival" aria-labelledby="festTitle">
    <div class="container">
      <div class="fest-card">
        <div class="fest-art" aria-hidden="true">
          <canvas class="fest-bk" width="440" height="500"></canvas>
          <span class="fest-art-diya fest-art-diya--l">${diyaSVG({ lit: true, tint: '#ff8a1f' })}</span>
          <span class="fest-art-diya fest-art-diya--r">${diyaSVG({ lit: true, tint: '#ffc83a' })}</span>
        </div>

        <div class="fest-main">
          <div class="fest-pills">${pills.join('')}</div>
          <h2 id="festTitle" class="fest-title">${esc(copy.title)}</h2>
          <p class="fest-sub">${subs}</p>
          ${plan.phase === 'after' ? '' : `<div class="fest-days" role="group" aria-label="The nine nights of Navratri and their colours">${chips}</div>
          <p class="fest-cap" aria-live="polite"></p>`}
        </div>

        <div class="fest-side">
          ${count ? `<div class="fest-count${plan.phase === 'dasara' ? ' is-today' : ''}"><span class="fest-count-n">${count.n}</span><span class="fest-count-l">${count.l}</span></div>` : ''}
          <p class="fest-pitch">${pitch}</p>
          <button type="button" class="btn fest-cta" data-fest="book"><i class="fa-solid fa-broom" aria-hidden="true"></i> Book Home Deep Cleaning</button>
          ${copy.share ? `<div class="fest-row">
            <button type="button" class="btn fest-ghost" data-fest="share"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share wishes</button>
            <button type="button" class="btn fest-ghost" data-fest="card"><i class="fa-solid fa-image" aria-hidden="true"></i> Greeting card</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function captionFor(plan, d) {
  const isToday = plan.nav && plan.nav.n === d.n;
  const when = isToday ? "Today's colour" : (plan.date > d.date ? `Night ${d.n} was` : `Night ${d.n} is`);
  return `<i class="fest-sw" style="--c:${d.hex}"></i><b>${esc(d.colour)}</b><span>${when} · Maa ${esc(d.devi)} · ${dateLabel(d.date)}</span>`;
}

function defaultCaption(plan) {
  if (plan.nav) return captionFor(plan, plan.nav);
  if (plan.phase === 'prelude') return `<span>Navratri begins tomorrow, ${dateLabel(NAVRATRI[0].date)}. Night 1 is <b>Orange</b>.</span>`;
  if (plan.phase === 'dasara') return '<span>Nine nights, nine colours, one victory.</span>';
  return '';
}

function wireStrip(strip, plan) {
  // Day chips: tap one to preview that night's colour
  const days = strip.querySelector('.fest-days');
  const cap = strip.querySelector('.fest-cap');
  if (days && cap) {
    const base = defaultCaption(plan);
    cap.innerHTML = base;
    const select = (n, scroll) => {
      const d = NAVRATRI[n - 1];
      days.querySelectorAll('.fest-day').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.day) === n)));
      cap.innerHTML = captionFor(plan, d);
      document.documentElement.style.setProperty('--fest-preview', d.hex);
      document.documentElement.style.setProperty('--fest-preview-rgb', rgbOf(d.hex).join(','));
      strip.classList.add('is-preview');
      if (scroll) days.scrollTo({ left: Math.max(0, days.querySelector(`[data-day="${n}"]`).offsetLeft - (days.clientWidth - 58) / 2), behavior: 'smooth' });
    };
    days.addEventListener('click', (e) => {
      const b = e.target.closest('.fest-day');
      if (!b) return;
      const n = Number(b.dataset.day);
      if (b.getAttribute('aria-pressed') === 'true') {                       // tap again: back to today
        days.querySelectorAll('.fest-day').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        cap.innerHTML = base;
        strip.classList.remove('is-preview');
      } else {
        select(n, false);
      }
    });
    // Start with today's chip centred (the last night once Navratri is over)
    const t = plan.nav ? plan.nav.n : (plan.phase === 'dasara' ? 9 : 1);
    const chip = days.querySelector(`[data-day="${t}"]`);
    if (chip) days.scrollLeft = Math.max(0, chip.offsetLeft - (days.clientWidth - chip.offsetWidth) / 2);
  }

  // Buttons
  const copy = copyFor(plan);
  strip.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-fest]');
    if (!btn) return;
    const what = btn.dataset.fest;
    if (what === 'book') {
      // booking.js listens for this; going through the event keeps a single copy of that module
      document.dispatchEvent(new CustomEvent('mnu:book', { detail: { id: 'home', search: false } }));
    } else if (what === 'share') {
      const text = `${copy.share}\n🌼 From all of us at MyNeedUrban Cleaning Services, Hyderabad\n`;
      const url = 'https://www.myneedurban.com';
      try {
        if (navigator.share) { await navigator.share({ title: copy.title, text, url }); return; }
      } catch (err) { if (err && err.name === 'AbortError') return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}${url}`)}`, '_blank', 'noopener');
    } else if (what === 'card') {
      btn.disabled = true;
      try {
        const m = await loadModule(CARD_URL);
        await m.openCard({ plan, copy, navratri: NAVRATRI, opener: btn });
      } catch (err) {
        console.warn('[festival] greeting card failed', err);
      } finally { btn.disabled = false; }
    }
  });
}

// ─── Other touches ────────────────────────────────────────────────────────────
function decorateServices() {
  document.querySelector('.service-card[data-book="home"]')?.setAttribute('data-fest-pick', '');
}

function buildFooterLine(plan) {
  const footer = document.querySelector('.footer');
  if (!footer) return;
  const text = plan.phase === 'after'
    ? 'Thank you for celebrating with us. Wishing you a bright, clean and happy Diwali season.'
    : 'Wishing you light, joy and victory this Navratri &amp; Dasara, from all of us at MyNeedUrban.';
  footer.prepend(html(`<div class="fest-foot"><p>🪔 ${text} 🪔</p></div>`));
}

// ─── Start ────────────────────────────────────────────────────────────────────
function loadCssOnce(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    const timer = setTimeout(() => { link.remove(); reject(new Error('festival.css timed out')); }, 7000);
    link.onload = () => { clearTimeout(timer); resolve(); };
    link.onerror = () => { clearTimeout(timer); link.remove(); reject(new Error('festival.css failed to load')); };
    document.head.appendChild(link);
  });
}

/** The stylesheet, with one more try if the first is aborted (see loadModule). */
async function loadCss() {
  try { return await loadCssOnce(CSS_URL); }
  catch (_) { await sleep(500); return loadCssOnce(`${CSS_URL}&retry=1`); }
}

function domReady() {
  return document.readyState === 'loading'
    ? new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }))
    : Promise.resolve();
}

/** Undo the boot script's early reservation (used if the theme can't be shown after all). */
function giveUp() {
  document.getElementById('festSlot')?.remove();
  document.documentElement.classList.remove('fest-on', 'fest-after');
}

async function main() {
  const plan = planFor(today());
  if (!plan) { giveUp(); return; }                         // out of season: leave the page alone
  const hero = document.getElementById('home');
  if (!hero || document.documentElement.classList.contains('fest')) return;

  // Fetch everything in parallel right away, so the art and petal modules are
  // long since downloaded by the time the page has loaded and the service
  // worker (first visit only) takes control.
  const saveData = navigator.connection && navigator.connection.saveData;
  const wantFx = !reduceMotion() && !saveData;
  const artReady = loadModule(ART_URL);
  const fxReady = wantFx ? loadModule(FX_URL) : null;
  artReady.catch(() => {});                                 // handled below; avoids an "unhandled" warning
  fxReady?.catch(() => {});

  try { await Promise.all([loadCss(), domReady()]); }
  catch (err) { console.warn('[festival]', err.message); giveUp(); return; }   // no styles, no theme

  const root = document.documentElement;
  const day = plan.nav || NAVRATRI[0];                     // outside the nine nights: festive orange
  root.style.setProperty('--fest-day', day.hex);
  root.style.setProperty('--fest-day-rgb', rgbOf(day.hex).join(','));
  root.style.setProperty('--fest-day-ink', inkFor(day.hex));
  root.dataset.festPhase = plan.phase;
  root.classList.add('fest');

  document.body.prepend(html(sprite()));
  buildToran(hero);
  hero.prepend(html('<div class="fest-glow" aria-hidden="true"></div>'));
  const msize = isPhone() ? 640 : 1000;                    // a smaller texture on phones
  const mandala = html(`<canvas class="fest-mandala" width="${msize}" height="${msize}" aria-hidden="true"></canvas>`);
  hero.prepend(mandala);
  buildMedal(hero);

  // The card goes into the placeholder index.html reserved for it (so nothing below jumps)
  let slot = document.getElementById('festSlot');
  if (!slot) { slot = html('<div class="fest-slot" id="festSlot"></div>'); hero.after(slot); }
  const strip = html(stripHTML(plan));
  slot.replaceChildren(strip);
  slot.classList.add('is-ready');
  wireStrip(strip, plan);
  decorateServices();
  buildFooterLine(plan);

  // Keep the toran's pendants evenly spaced when the window changes size
  let width = hero.clientWidth;
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.abs(hero.clientWidth - width) < 40) return;
      width = hero.clientWidth;
      buildToran(hero);
    }, 250);
  });

  // Drawn art (the card is already readable without it)
  artReady.then((A) => {
    const m = mandala.getContext('2d');
    A.mandala(m, msize / 2, msize / 2, msize * 0.48, 'rgb(255,196,60)', msize / 450);
    const bk = strip.querySelector('.fest-bk');
    if (bk) {
      const c = bk.getContext('2d');
      const g = c.createRadialGradient(220, 300, 10, 220, 300, 230);
      g.addColorStop(0, 'rgba(255,170,0,.34)');
      g.addColorStop(1, 'rgba(255,170,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 440, 500);
      A.bathukamma(c, 220, 410, 360);
      bk.classList.add('ready');
    }
    mandala.classList.add('ready');
  }).catch((err) => console.warn('[festival] art failed', err));

  // Petals and sparks: only where motion is welcome
  if (fxReady) {
    fxReady
      .then((fx) => fx.start(hero, { phone: isPhone(), burst: !sessionStorage.getItem('mnu-fest-burst') }))
      .then(() => { try { sessionStorage.setItem('mnu-fest-burst', '1'); } catch (_) { /* private mode */ } })
      .catch((err) => console.warn('[festival] fx failed', err));
  }
}

main();
