/* ===============================
   MyNeedUrban — main.js
   Core: header, nav, scrollspy, reveal
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

  // Mobile nav toggle. The drawer is #headerCollapse (nav links + the secondary
  // buttons); older pages that only have #nav still work via the fallback.
  const nav = document.getElementById('nav');
  const drawer = document.getElementById('headerCollapse') || nav;
  const navToggle = document.getElementById('navToggle');
  if (navToggle && drawer) {
    const setOpen = (open) => {
      drawer.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    };
    navToggle.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));

    // Close after picking a link, or after tapping any button inside the drawer
    drawer.querySelectorAll('a, button').forEach(el =>
      el.addEventListener('click', () => setOpen(false))
    );

    // Close on Escape, and on outside click
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) setOpen(false);
    });
    document.addEventListener('click', (e) => {
      if (!drawer.classList.contains('open')) return;
      if (drawer.contains(e.target) || navToggle.contains(e.target)) return;
      setOpen(false);
    });
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

  // Reveal on scroll (IntersectionObserver)
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();
