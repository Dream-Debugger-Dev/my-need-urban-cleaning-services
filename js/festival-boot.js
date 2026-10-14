/* ==========================================================================
   MyNeedUrban — festival-boot.js
   Runs in <head>, before the first paint, and does one tiny thing: on festival
   days it marks the page (<html class="fest-on">) so css/app.css can hold open
   the space the festive card will fill. Without it the card would appear a
   moment after load and shove the Services section down (layout shift).

   Everything else is in js/festival.js. FROM/TO/DASARA below must match
   SEASON and DASARA at the top of that file. Off-season this does nothing at
   all.   Preview: ?fest=2026-10-19    Off: ?fest=off
   ========================================================================== */
(function () {
  var FROM = '2026-10-10', TO = '2026-10-21', DASARA = '2026-10-20';
  var m = /[?&]fest=([^&#]*)/.exec(location.search);
  var q = m ? decodeURIComponent(m[1]) : '';
  if (q === 'off') return;
  var day;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
    day = q;
  } else {
    try {
      day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      day = new Date(Date.now() + 19800000).toISOString().slice(0, 10);   // UTC+5:30
    }
  }
  if (day < FROM || day > TO) return;

  var html = document.documentElement;
  html.className += ' fest-on' + (day > DASARA ? ' fest-after' : '');

  // If the festive layer never shows up (offline, blocked...), don't leave an empty card behind
  setTimeout(function () {
    var slot = document.getElementById('festSlot');
    if (slot && slot.className.indexOf('is-ready') < 0) {
      slot.parentNode.removeChild(slot);
      html.className = html.className.replace(/\s*fest-(on|after)\b/g, '');
    }
  }, 9000);
})();
