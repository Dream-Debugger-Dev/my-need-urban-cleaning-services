/* ==========================================================================
   MyNeedUrban — diwali-boot.js
   The Diwali 2026 season switch. Runs in <head> before the first paint, so the
   festive theme is there from the very first frame (no flash of the normal
   page). It does three small things and nothing else:

     1. Decides if it is Diwali season in India (20 Oct to 11 Nov 2026).
     2. Marks the page:  <html class="dw dw-before|dw-day|dw-after dw-pause dw-fx">
        css/diwali.css does all the dressing up from those classes.
     3. Publishes the facts the other scripts need as window.MNU_FESTIVE: the
        dates, the countdown moment and the list of services that are paused.

   THIS FILE IS THE ONLY PLACE THE DATES AND THE PAUSED SERVICES LIVE.
   Out of season it does nothing at all, so there is nothing to clean up:
   the theme, the notice and the pause all switch off by themselves after
   11 November 2026.

   Preview a day:   ?diwali=2026-11-08          (noon, India time)
   Preview a time:  ?diwali=2026-11-08T17:59:40 (the clock keeps running)
   Switch off:      ?diwali=off
   ========================================================================== */
(function () {
  'use strict';

  // ─── The calendar (India dates, inclusive) ─────────────────────────────────
  var SEASON = { from: '2026-10-20', to: '2026-11-11' };      // the theme is on
  var DIWALI = '2026-11-08';                                    // Lakshmi Puja, Sunday
  var DIWALI_AT = '2026-11-08T18:00:00+05:30';                  // the countdown ends here
  var STAGES = [                                                // the days before Diwali itself
    { date: '2026-11-06', name: 'Dhanteras' },
    { date: '2026-11-07', name: 'Choti Diwali' },
    { date: DIWALI, name: 'Diwali' },
  ];

  // ─── The festive pause ─────────────────────────────────────────────────────
  // Small cleaning services we are NOT booking during the season. "ids" are the
  // booking catalog's top-level service ids (js/booking.js). Balcony and
  // single-room cleaning are not separate services on the site, so they only
  // appear in the notice and in "terms" (words that make a search show it).
  var PAUSE = {
    from: '2026-10-20',
    to: '2026-11-11',
    ids: ['bathroom', 'sofa', 'carpet'],
    names: ['Washroom Cleaning', 'Balcony Cleaning', 'Sofa Cleaning', 'Carpet Cleaning', 'Single Room Cleaning'],
    terms: {
      balcony: 'Balcony Cleaning',
      'single room': 'Single Room Cleaning',
      'one room': 'Single Room Cleaning',
      '1 room': 'Single Room Cleaning',
      'room cleaning': 'Single Room Cleaning',
    },
  };

  // ─── Today in India, or the preview moment ─────────────────────────────────
  var m = /[?&]diwali=([^&#]*)/.exec(location.search);
  var q = m ? decodeURIComponent(m[1]) : '';
  if (q === 'off') return;

  var offset = 0;                                               // preview: shift the clock, let it keep running
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(q)) {
    var t = q.length === 10 ? q + 'T12:00:00' : q;
    if (t.length === 16) t += ':00';
    var at = Date.parse(t + '+05:30');
    if (!isNaN(at)) offset = at - Date.now();
  }
  function now() { return Date.now() + offset; }
  function istDay(ms) { return new Date(ms + 19800000).toISOString().slice(0, 10); }   // UTC+5:30

  var day = istDay(now());
  if (day < SEASON.from || day > SEASON.to) return;             // out of season: leave the page alone

  var phase = day < DIWALI ? 'before' : day === DIWALI ? 'day' : 'after';
  var pauseOn = day >= PAUSE.from && day <= PAUSE.to;

  // Motion: on unless the visitor asked for less (or is saving data), and they can switch it themselves
  var calm = false;
  try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var saved = '';
  try { saved = localStorage.getItem('mnu-dw-fx') || ''; } catch (e) { /* private mode */ }
  var fx = saved ? saved === 'on' : !(calm || saveData);

  window.MNU_FESTIVE = {
    season: 'diwali',
    day: day,
    phase: phase,
    preview: offset !== 0,
    now: now,
    diwali: DIWALI,
    at: Date.parse(DIWALI_AT),
    stages: STAGES,
    to: SEASON.to,
    fx: fx,
    calm: calm || saveData,                                     // the visitor asked for less motion
    pause: { on: pauseOn, ids: PAUSE.ids.slice(), names: PAUSE.names.slice(), terms: PAUSE.terms, to: PAUSE.to },
  };

  var html = document.documentElement;
  html.className += ' dw dw-' + phase + (pauseOn ? ' dw-pause' : '') + (fx ? ' dw-fx' : '');

  // The script font for the greetings ("Happy Diwali"). Only fetched in season; text shows at once in a serif
  // and swaps when the font arrives.
  try {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Yellowtail&display=swap';
    document.head.appendChild(link);
  } catch (e) { /* the serif fallback is fine */ }
})();
