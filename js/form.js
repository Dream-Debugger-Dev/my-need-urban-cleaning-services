/* ===============================
   MyNeedUrban — form.js
   Contact form → Firebase Firestore
   =============================== */

import { db, collection, addDoc, serverTimestamp } from './firebase-config.js';

const form = document.getElementById('contactForm');
const note = document.getElementById('formNote');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.name || !data.phone || !data.service) {
      note.style.color = '#dc2626';
      note.textContent = 'Please fill your name, phone and a service.';
      return;
    }

    // Disable button while submitting
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      // Write booking to Firestore
      await addDoc(collection(db, 'bookings'), {
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email || '',
        serviceName: data.service,
        notes: data.message || '',
        source: 'website',
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      note.style.color = '#16a34a';
      note.textContent = 'Thanks! We received your request and will call you shortly.';
      form.reset();
    } catch (error) {
      console.error('Booking error:', error);
      note.style.color = '#dc2626';
      note.textContent = 'Something went wrong. Please call us directly or try again.';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Request';
  });
}
