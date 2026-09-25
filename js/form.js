/* ===============================
   MyNeedUrban — form.js
   "Request a call back" form → a booking the admin dashboard can act on.

   Writes the same document shape as the booking sheet (channel 'callback'),
   so call-backs get an order ID, show up on the admin page with Call and
   WhatsApp buttons, and pass the same Firestore validation rules.
   =============================== */
import { auth, db, collection, addDoc, serverTimestamp } from './firebase-config.js?v=20260924b';
import { makeOrderId } from './order-id.js?v=20260924b';

const form = document.getElementById('contactForm');
const note = document.getElementById('formNote');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 10-digit Indian mobile from "+91 98765 43210", "098765 43210", etc. */
const mobile10 = raw => String(raw || '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');

if (form && note) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const name = String(data.name || '').trim();
    const phone = mobile10(data.phone);
    const email = String(data.email || '').trim();
    const service = String(data.service || '').trim();
    const message = String(data.message || '').trim();

    const fail = (msg) => { note.style.color = '#dc2626'; note.textContent = msg; };
    if (!name) return fail('Please enter your name.');
    if (!/^\d{10}$/.test(phone)) return fail('Please enter a valid 10-digit mobile number.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return fail('Please enter a valid email, or leave it blank.');
    if (!service) return fail('Please choose a service.');

    const btn = form.querySelector('button[type="submit"]');
    const btnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    const orderId = makeOrderId();
    const user = auth.currentUser;
    try {
      await addDoc(collection(db, 'bookings'), {
        orderId,
        status: 'pending',
        source: 'website',
        channel: 'callback',

        customerId: user?.uid || null,
        isGuest: !user,
        customerName: name.slice(0, 100),
        customerPhone: phone,
        customerAltPhone: '',
        customerEmail: email.slice(0, 120),

        scheduledDate: null,

        serviceId: 'callback',
        serviceName: service.slice(0, 120),
        servicePath: `Call-back request > ${service}`.slice(0, 300),
        enquiredVia: null,
        venueType: null,

        pricingType: 'quote',
        priceUnit: null,
        quantity: 1,
        amount: 0,
        mrp: null,

        address: '',
        addressParts: null,
        geo: null,
        mapsLink: null,

        notes: message.slice(0, 2000),
        createdAt: serverTimestamp(),
      });
      note.style.color = '#16a34a';
      note.innerHTML = `Thanks, ${esc(name.split(/\s+/)[0])}! We'll call you on +91 ${phone} shortly. `
        + `Your reference is <strong>${orderId}</strong>.`;
      form.reset();
    } catch (error) {
      console.error('[callback] save failed', error);
      fail('Something went wrong. Please call us on 96133 04724 or try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = btnHtml;
    }
  });
}
