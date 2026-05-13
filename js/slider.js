/* ===============================
   MyNeedUrban — slider.js
   Before / After image comparison
   =============================== */

(() => {
  'use strict';

  const initBA = (el) => {
    const beforeWrap = el.querySelector('.ba-before-wrap');
    const beforeImg = el.querySelector('.ba-before');
    const handle = el.querySelector('.ba-handle');
    let rect;
    let pct = 50;

    const setPct = (p) => {
      pct = Math.max(0, Math.min(100, p));
      beforeWrap.style.width = pct + '%';
      if (handle) handle.style.left = pct + '%';
      if (beforeImg) beforeImg.style.width = (100 / (pct / 100 || 0.0001)) + '%';
    };
    setPct(50);

    const onMove = (clientX) => {
      rect = el.getBoundingClientRect();
      setPct(((clientX - rect.left) / rect.width) * 100);
    };

    let active = false;
    const down = (e) => { active = true; onMove(e.touches ? e.touches[0].clientX : e.clientX); };
    const move = (e) => { if (!active) return; onMove(e.touches ? e.touches[0].clientX : e.clientX); };
    const up = () => { active = false; };

    el.addEventListener('mousedown', down);
    el.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);

    el.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) onMove(e.clientX);
    });
  };

  document.querySelectorAll('[data-ba]').forEach(initBA);
})();
