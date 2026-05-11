/* ===============================
   MyNeedUrban — main.js
   =============================== */

(() => {
  'use strict';

  // Footer year
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // Sticky header shadow on scroll
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile nav toggle
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => nav.classList.remove('open'))
    );
  }

  // Active nav link on scroll (scrollspy)
  const navLinks = document.querySelectorAll('.nav a[href^="#"]');
  const sections = [...navLinks]
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  const setActive = () => {
    const y = window.scrollY + 120;
    let current = sections[0]?.id;
    sections.forEach(s => { if (s.offsetTop <= y) current = s.id; });
    navLinks.forEach(a =>
      a.classList.toggle('active', a.getAttribute('href') === '#' + current)
    );
  };
  window.addEventListener('scroll', setActive, { passive: true });
  setActive();

  // Reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // Before / After slider
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
      // Keep the "before" image at natural size so it doesn't stretch
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

    // Also react to hover-drag without click (nicer UX on desktop)
    el.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) onMove(e.clientX);
    });
  };
  document.querySelectorAll('[data-ba]').forEach(initBA);

  // Contact form (client-side only for now)
  const form = document.getElementById('contactForm');
  const note = document.getElementById('formNote');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.phone || !data.service) {
        note.style.color = '#dc2626';
        note.textContent = 'Please fill your name, phone and a service.';
        return;
      }
      note.style.color = '';
      note.textContent = 'Thanks! We received your request and will call you shortly.';
      form.reset();
      // TODO: Wire this up to a real backend / email service when ready
    });
  }
})();
