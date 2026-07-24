/* ===============================
   MyNeedUrban — booking.js
   3-step booking wizard modal
   =============================== */

import { auth, db, collection, addDoc, serverTimestamp } from './firebase-config.js';
import { showToast, openModal } from './auth.js';

// ─── Service Catalog (matches app service_catalog.dart) ──────────────────────
const SERVICE_CATALOG = [
  {
    id: 'home', title: 'Home Cleaning', icon: 'fa-house-chimney',
    subtitle: 'Regular & deep home cleaning',
    children: [
      { id: 'home_1bhk', title: '1 BHK', icon: 'fa-home', isLeaf: true, isFixed: false, requirementHint: 'Approx. size and number of rooms?' },
      { id: 'home_2bhk', title: '2 BHK', icon: 'fa-home', isLeaf: true, isFixed: false, requirementHint: 'Approx. size and number of rooms?' },
      { id: 'home_3bhk', title: '3 BHK', icon: 'fa-home', isLeaf: true, isFixed: false, requirementHint: 'Approx. size and number of rooms?' },
      { id: 'home_villa', title: 'Villa / Bungalow', icon: 'fa-building', isLeaf: true, isFixed: false, requirementHint: 'Number of floors and rooms?' },
    ]
  },
  {
    id: 'deep', title: 'Deep Cleaning', icon: 'fa-broom',
    subtitle: 'Move-in, move-out & seasonal',
    children: [
      { id: 'deep_1bhk', title: '1 BHK Deep Clean', icon: 'fa-broom', isLeaf: true, isFixed: false },
      { id: 'deep_2bhk', title: '2 BHK Deep Clean', icon: 'fa-broom', isLeaf: true, isFixed: false },
      { id: 'deep_3bhk', title: '3 BHK Deep Clean', icon: 'fa-broom', isLeaf: true, isFixed: false },
      { id: 'deep_villa', title: 'Villa Deep Clean', icon: 'fa-building', isLeaf: true, isFixed: false },
    ]
  },
  {
    id: 'bathroom', title: 'Bathroom Cleaning', icon: 'fa-bath',
    subtitle: 'Per bathroom · Descaling & sanitising',
    isLeaf: true, isFixed: true, price: 499, priceUnit: 'per bathroom',
  },
  {
    id: 'kitchen', title: 'Kitchen Cleaning', icon: 'fa-utensils',
    subtitle: 'Deep clean inside & out',
    children: [
      { id: 'kitchen_basic', title: 'Kitchen Only', icon: 'fa-utensils', isLeaf: true, isFixed: true, price: 999, priceUnit: 'per visit' },
      { id: 'kitchen_full', title: 'Kitchen + Fridge + Microwave', icon: 'fa-utensils', isLeaf: true, isFixed: true, price: 1499, priceUnit: 'per visit' },
    ]
  },
  {
    id: 'sofa', title: 'Sofa Cleaning', icon: 'fa-couch',
    subtitle: 'Per seat · Fabric & leather',
    isLeaf: true, isFixed: true, price: 499, priceUnit: 'per seat',
  },
  {
    id: 'carpet', title: 'Carpet Cleaning', icon: 'fa-rug',
    subtitle: 'Shampoo & steam clean',
    isLeaf: true, isFixed: false, requirementHint: 'Number and approximate size of carpets?',
  },
  {
    id: 'mattress', title: 'Mattress Cleaning', icon: 'fa-bed',
    subtitle: 'Per mattress · Dust mite removal',
    isLeaf: true, isFixed: true, price: 699, priceUnit: 'per mattress',
  },
  {
    id: 'office', title: 'Office Cleaning', icon: 'fa-briefcase',
    subtitle: 'Daily / weekly office cleaning',
    isLeaf: true, isFixed: false, requirementHint: 'Office size (sq ft) and number of workstations?',
  },
  {
    id: 'floor', title: 'Floor Cleaning', icon: 'fa-shoe-prints',
    subtitle: 'Tile, marble, wood',
    isLeaf: true, isFixed: false, requirementHint: 'Floor type and approximate area?',
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let _selectedService = null;
let _step = 0; // 0=catalog, 1=schedule, 2=address, 3=confirm
let _selectedDate = null;
let _selectedTime = null;
let _quantity = 1;
let _currentCatalog = null; // null = top level

const TIME_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getBreadcrumb(node) {
  // Walk up parents — simplified for web
  return node.title;
}

function getTotal() {
  if (!_selectedService || !_selectedService.isFixed) return null;
  return _selectedService.price * _quantity;
}

// ─── Open booking ─────────────────────────────────────────────────────────────
export function openBooking(serviceId) {
  if (!auth.currentUser) {
    openModal('authModal');
    showToast('Please login to book a service');
    return;
  }
  _step = 0;
  _selectedService = null;
  _selectedDate = null;
  _selectedTime = null;
  _quantity = 1;
  _currentCatalog = null;

  if (serviceId) {
    // Find service in catalog
    const found = findService(serviceId, SERVICE_CATALOG);
    if (found) {
      if (found.isLeaf) {
        _selectedService = found;
        _step = 1;
        renderBookingStep();
      } else {
        _currentCatalog = found;
        _step = 0;
        renderCatalog(found.children, found.title);
      }
    }
  }
  document.getElementById('bookingModal')?.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  renderBookingStep();
}

function findService(id, catalog) {
  for (const item of catalog) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findService(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderBookingStep() {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;
  const body = modal.querySelector('.booking-body');
  const progress = modal.querySelector('.booking-progress');
  const title = modal.querySelector('.booking-title');

  if (_step === 0) {
    // Catalog
    title.textContent = _currentCatalog ? _currentCatalog.title : 'Select a Service';
    progress.innerHTML = renderProgress(0);
    body.innerHTML = renderCatalogHTML(_currentCatalog ? _currentCatalog.children : SERVICE_CATALOG);
    attachCatalogEvents(body);
  } else if (_step === 1) {
    title.textContent = _selectedService.isFixed ? 'Book a Service' : 'Request a Quote';
    progress.innerHTML = renderProgress(1);
    body.innerHTML = renderScheduleStep();
    attachScheduleEvents(body);
  } else if (_step === 2) {
    title.textContent = 'Service Address';
    progress.innerHTML = renderProgress(2);
    body.innerHTML = renderAddressStep();
  } else if (_step === 3) {
    title.textContent = 'Confirm';
    progress.innerHTML = renderProgress(3);
    body.innerHTML = renderConfirmStep();
    attachConfirmEvents(body);
  }
}

function renderProgress(active) {
  const steps = ['Service', 'Schedule', 'Address', 'Confirm'];
  return steps.map((s, i) => `
    <div class="bp-step ${i <= active ? 'active' : ''} ${i < active ? 'done' : ''}">
      <div class="bp-dot">${i < active ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
      <span>${s}</span>
    </div>
    ${i < steps.length - 1 ? '<div class="bp-line ' + (i < active ? 'active' : '') + '"></div>' : ''}
  `).join('');
}

function renderCatalogHTML(items) {
  return `<div class="catalog-list">${items.map(item => `
    <div class="catalog-item" data-id="${item.id}" data-leaf="${item.isLeaf || false}">
      <div class="ci-icon"><i class="fa-solid ${item.icon}"></i></div>
      <div class="ci-info">
        <strong>${item.title}</strong>
        ${item.subtitle ? `<small>${item.subtitle}</small>` : ''}
      </div>
      ${item.isLeaf && item.isFixed
        ? `<span class="ci-price">₹${item.price}</span>`
        : item.isLeaf
          ? `<span class="ci-quote">Get Quote</span>`
          : `<i class="fa-solid fa-chevron-right ci-arrow"></i>`}
    </div>
  `).join('')}</div>`;
}

function attachCatalogEvents(body) {
  body.querySelectorAll('.catalog-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const isLeaf = el.dataset.leaf === 'true';
      const node = findService(id, SERVICE_CATALOG);
      if (!node) return;
      if (isLeaf) {
        _selectedService = node;
        _step = 1;
      } else {
        _currentCatalog = node;
        _step = 0;
      }
      renderBookingStep();
    });
  });
}

function renderScheduleStep() {
  const today = new Date();
  const hasQty = _selectedService.isFixed && _selectedService.priceUnit?.startsWith('per ');
  const unitLabel = hasQty ? _selectedService.priceUnit.replace('per ', '') + 's' : '';

  // Build date options (next 14 days)
  let dateOptions = '';
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const val = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    dateOptions += `<option value="${val}" ${_selectedDate === val ? 'selected' : ''}>${label}</option>`;
  }

  return `
    <div class="service-header-chip">
      <i class="fa-solid ${_selectedService.icon}"></i>
      <span>${_selectedService.title}</span>
      ${_selectedService.isFixed ? `<strong>₹${_selectedService.price} ${_selectedService.priceUnit || ''}</strong>` : '<strong>Get a Quote</strong>'}
    </div>

    ${hasQty ? `
    <div class="step-section">
      <label class="step-label">Number of ${unitLabel}</label>
      <div class="qty-row">
        <button class="qty-btn" id="qtyMinus"><i class="fa-solid fa-minus"></i></button>
        <span class="qty-val" id="qtyVal">${_quantity}</span>
        <button class="qty-btn" id="qtyPlus"><i class="fa-solid fa-plus"></i></button>
        ${_selectedService.isFixed ? `<span class="qty-total">Total: ₹${getTotal() || _selectedService.price * _quantity}</span>` : ''}
      </div>
    </div>` : ''}

    <div class="step-section">
      <label class="step-label">Select Date</label>
      <select class="field-input" id="bookingDate">
        <option value="">Choose a date</option>
        ${dateOptions}
      </select>
    </div>

    <div class="step-section">
      <label class="step-label">Select Time Slot</label>
      <div class="time-slots">
        ${TIME_SLOTS.map(t => `
          <button class="time-slot ${_selectedTime === t ? 'active' : ''}" data-time="${t}">${t}</button>
        `).join('')}
      </div>
    </div>

    <div class="step-btns">
      <button class="btn btn-outline" id="backToCatalog"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toAddressStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

function attachScheduleEvents(body) {
  // Quantity
  body.querySelector('#qtyMinus')?.addEventListener('click', () => {
    if (_quantity > 1) { _quantity--; renderBookingStep(); }
  });
  body.querySelector('#qtyPlus')?.addEventListener('click', () => {
    _quantity++;
    renderBookingStep();
  });

  // Date
  body.querySelector('#bookingDate')?.addEventListener('change', (e) => {
    _selectedDate = e.target.value;
  });

  // Time slots
  body.querySelectorAll('.time-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedTime = btn.dataset.time;
      body.querySelectorAll('.time-slot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Navigation
  body.querySelector('#backToCatalog')?.addEventListener('click', () => {
    _step = 0;
    renderBookingStep();
  });
  body.querySelector('#toAddressStep')?.addEventListener('click', () => {
    _selectedDate = body.querySelector('#bookingDate')?.value;
    if (!_selectedDate) { alert('Please select a date'); return; }
    if (!_selectedTime) { alert('Please select a time slot'); return; }
    _step = 2;
    renderBookingStep();
  });
}

function renderAddressStep() {
  return `
    <div class="step-section">
      <label class="step-label">Your Address</label>
      <textarea class="field-input" id="bookingAddress" rows="3" placeholder="Flat/House No., Building, Street, Area...">${window._bookingAddress || ''}</textarea>
    </div>
    <div class="step-section">
      <label class="step-label">${_selectedService.isFixed ? 'Notes (optional)' : 'Describe your requirement'}</label>
      <textarea class="field-input" id="bookingNotes" rows="3" placeholder="${_selectedService.requirementHint || 'Any special instructions?'}">${window._bookingNotes || ''}</textarea>
    </div>
    <div class="info-chip"><i class="fa-solid fa-location-dot"></i> We serve all of Hyderabad & Telangana</div>
    <div class="step-btns">
      <button class="btn btn-outline" id="backToSchedule"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toConfirmStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

function renderConfirmStep() {
  const total = getTotal();
  const dateLabel = _selectedDate
    ? new Date(_selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
    : '-';

  return `
    <div class="confirm-rows">
      <div class="confirm-row"><span>Service</span><strong>${_selectedService.title}</strong></div>
      ${_quantity > 1 ? `<div class="confirm-row"><span>Quantity</span><strong>${_quantity}</strong></div>` : ''}
      <div class="confirm-row"><span>Date</span><strong>${dateLabel}</strong></div>
      <div class="confirm-row"><span>Time</span><strong>${_selectedTime}</strong></div>
      <div class="confirm-row"><span>Address</span><strong>${window._bookingAddress || '-'}</strong></div>
      ${window._bookingNotes ? `<div class="confirm-row"><span>Notes</span><strong>${window._bookingNotes}</strong></div>` : ''}
    </div>
    <div class="confirm-total ${_selectedService.isFixed ? 'fixed' : 'quote'}">
      ${_selectedService.isFixed
        ? `<div><span>Total</span><strong>₹${total}</strong></div>
           <small><i class="fa-solid fa-hand-holding-heart"></i> Pay after service — cash or UPI</small>`
        : `<div class="quote-note"><i class="fa-solid fa-comment-dots"></i> We'll call you shortly with your custom quote</div>`}
    </div>
    <p id="bookingError" class="booking-error"></p>
    <div class="step-btns">
      <button class="btn btn-outline" id="backToAddress"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn ${_selectedService.isFixed ? 'btn-orange' : 'btn-primary'}" id="submitBooking">
        <i class="fa-solid fa-paper-plane"></i>
        ${_selectedService.isFixed ? 'Confirm Booking' : 'Submit Request'}
      </button>
    </div>
  `;
}

function attachConfirmEvents(body) {
  body.querySelector('#backToAddress')?.addEventListener('click', () => {
    _step = 2;
    renderBookingStep();
  });
  body.querySelector('#submitBooking')?.addEventListener('click', submitBooking);
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submitBooking() {
  const user = auth.currentUser;
  if (!user) { openModal('authModal'); return; }
  const errEl = document.getElementById('bookingError');
  const btn = document.getElementById('submitBooking');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

  try {
    await addDoc(collection(db, 'bookings'), {
      customerId: user.uid,
      customerName: window._userProfile?.name || user.displayName || '',
      customerPhone: window._userProfile?.phone || user.phoneNumber || '',
      customerEmail: window._userProfile?.email || user.email || '',
      serviceId: _selectedService.id,
      serviceName: _selectedService.title,
      pricingType: _selectedService.isFixed ? 'fixed' : 'quote',
      quantity: _quantity,
      amount: _selectedService.isFixed ? getTotal() : 0,
      address: window._bookingAddress || '',
      notes: window._bookingNotes || '',
      scheduledDate: _selectedDate,
      timeSlot: _selectedTime,
      status: 'pending',
      paymentMethod: _selectedService.isFixed ? 'pay_after_service' : 'on_quote',
      source: 'website',
      createdAt: serverTimestamp(),
    });

    // Show success
    const modal = document.getElementById('bookingModal');
    modal.querySelector('.booking-body').innerHTML = `
      <div class="booking-success">
        <div class="success-icon"><i class="fa-solid fa-check"></i></div>
        <h3>${_selectedService.isFixed ? 'Booking Confirmed!' : 'Request Received!'}</h3>
        <p>${_selectedService.isFixed
          ? "We'll call you shortly to confirm. Payment via cash or UPI after service."
          : "We'll review your requirement and share a quote via call / WhatsApp."}</p>
        <button class="btn btn-primary" onclick="document.getElementById('bookingModal').classList.remove('modal-open');document.body.style.overflow=''">Done</button>
      </div>
    `;
    modal.querySelector('.booking-progress').innerHTML = '';
    modal.querySelector('.booking-title').textContent = '✓ Success';
  } catch (err) {
    errEl.textContent = 'Something went wrong. Please try again.';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Try Again';
  }
}

// ─── Wire up service cards ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Service cards "Book Now" buttons
  document.querySelectorAll('[data-book]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openBooking(el.dataset.book);
    });
  });

  // Address/notes capture on step 2
  document.getElementById('bookingModal')?.addEventListener('input', (e) => {
    if (e.target.id === 'bookingAddress') window._bookingAddress = e.target.value;
    if (e.target.id === 'bookingNotes') window._bookingNotes = e.target.value;
  });

  // Back nav for address step
  document.getElementById('bookingModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'backToSchedule') {
      window._bookingAddress = document.getElementById('bookingAddress')?.value;
      window._bookingNotes = document.getElementById('bookingNotes')?.value;
      _step = 1;
      renderBookingStep();
    }
    if (e.target.id === 'toConfirmStep') {
      window._bookingAddress = document.getElementById('bookingAddress')?.value;
      window._bookingNotes = document.getElementById('bookingNotes')?.value;
      if (!window._bookingAddress?.trim()) { alert('Please enter your address'); return; }
      _step = 3;
      renderBookingStep();
    }
  });

  // Close booking modal
  document.querySelector('#bookingModal [data-close-modal]')?.addEventListener('click', () => {
    document.getElementById('bookingModal').classList.remove('modal-open');
    document.body.style.overflow = '';
  });
  document.getElementById('bookingModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'bookingModal') {
      document.getElementById('bookingModal').classList.remove('modal-open');
      document.body.style.overflow = '';
    }
  });
});
