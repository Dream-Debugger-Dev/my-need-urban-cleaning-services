/* ===============================
   MyNeedUrban — form.js
   Contact form handling
   =============================== */

(() => {
  'use strict';

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
      // TODO: Wire this up to Firebase backend when ready
    });
  }
})();
