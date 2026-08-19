/* ===============================
   MyNeedUrban — booking.js
   Booking wizard: no login gate, WhatsApp / Call CTA at end
   =============================== */

import { auth, db, collection, addDoc, serverTimestamp } from './firebase-config.js';
import { showToast, openModal } from './auth.js';

// ─── Service Catalog ──────────────────────────────────────────────────────────

const UNFURNISHED_COVERED = [
  'Hall, Bedroom, Wardrobe Interior & Exterior wet wiping',
  'Windows, Fan, AC, Switchboard & Door — Dry & wet wiping',
  'Cobweb removal & wall dusting',
  'Kitchen cabinets Interior & Exterior wet scrubbing & wiping',
  'Chimney Exterior & Filter Cleaning',
  'Bathroom Deep Cleaning',
  'Balcony Cleaning',
  'Floor Deep Cleaning with Machine',
];
const UNFURNISHED_NOT_COVERED = [
  'Glue / paint stains / sticker removal',
  'Cleaning of terrace & inaccessible areas',
  'Wet wiping of walls & ceiling',
];

const FURNISHED_COVERED = [
  'Hall, Bedroom, Wardrobe Exterior wet wiping',
  'Windows, Fan, AC, Switchboard & Door — Dry & wet wiping',
  'Cobweb removal & wall dusting',
  'Sofa, Carpet and Mattress Dry Vacuum',
  'Kitchen cabinets Interior & Exterior wet scrubbing & wiping',
  'Chimney Exterior & Filter Cleaning',
  'Bathroom Deep Cleaning',
  'Balcony Cleaning',
  'Floor Deep Cleaning with Machine',
];
const FURNISHED_NOT_COVERED = [
  'Glue / paint stains / sticker removal',
  'Cleaning of terrace & inaccessible areas',
  'Wet wiping of walls & ceiling',
];
const FURNISHED_ADDONS = [
  'Hall & Bedroom Wardrobe Interior wiping — additional price',
  'Fridge, Microwave and Oven cleaning — additional price',
  'Sofa, Carpet, Mattress wet shampooing — additional price',
];

// ─── Kitchen deep cleaning ────────────────────────────────────────────────────
// Work common to every kitchen package.
const KITCHEN_BASE_COVERED = [
  'Cleaning of tiles, slabs, sink and windows',
  'Cabinet cleaning — Interior & Exterior',
  'Oil stain removal',
  'Gas stove & hob cleaning',
];

const KITCHEN_CHIMNEY    = 'Chimney cleaning';
const KITCHEN_FRIDGE     = 'Fridge cleaning';
const KITCHEN_APPLIANCES = 'Microwave, oven & other appliance cleaning';

/**
 * Builds the inclusion list for a kitchen package.
 * Each package lists exactly what it covers (no "if selected" ambiguity).
 * @param {boolean} occupied - occupied kitchens add utensil re-arrangement
 * @param {string[]} extras  - appliance items included at this tier
 */
const kitchenCovered = (occupied, extras = []) => [
  ...(occupied ? ['Utensil re-arrangement'] : []),
  ...KITCHEN_BASE_COVERED,
  ...extras,
];

// ─── Floor-only deep cleaning ─────────────────────────────────────────────────
// Floors only. Everything else in a full deep clean is deliberately excluded.
const FLOOR_COVERED = [
  'All floor deep cleaning with machine',
  'Hall & Bedroom floor cleaning',
  'Kitchen floor cleaning',
  'Bathroom floor cleaning',
  'Balcony floor cleaning',
];

const FLOOR_NOT_COVERED = [
  'Glue / paint stains / sticker removal',
  'Cleaning of terrace & inaccessible areas',
  'Wet wiping of walls & ceiling',
  'Hall & Bedroom wardrobe Interior & Exterior wet wiping',
  'Windows, Fan, AC, Switchboard & Door — Dry & wet wiping',
  'Cobweb removal & wall dusting',
  'Kitchen cabinets Interior & Exterior wet scrubbing & wiping',
  'Bathroom deep cleaning',
  'Balcony dusting & cleaning',
];

/** Builds the 1–5 BHK floor-cleaning tiers for a furnishing type. */
const floorTiers = (furnish, prices) =>
  [1, 2, 3, 4, 5].map(n => ({
    id: `floor-${furnish.toLowerCase()}-${n}bhk`,
    title: `${n} BHK`,
    icon: 'fa-home',
    isLeaf: true,
    isFixed: true,
    price: prices[n - 1],
    priceUnit: 'per visit',
    covered: FLOOR_COVERED,
    notCovered: FLOOR_NOT_COVERED,
  }));

const SERVICE_CATALOG = [
  {
    id: 'deep', title: 'Deep Cleaning', icon: 'fa-broom',
    subtitle: 'Unfurnished & Furnished premium packages',
    children: [
      {
        id: 'deep-unfurnished', title: 'Unfurnished House', icon: 'fa-house-chimney',
        subtitle: 'Premium deep clean',
        children: [
          { id: 'deep-uf-1bhk', title: '1 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 3899, mrp: 5164, priceUnit: 'per visit', covered: UNFURNISHED_COVERED, notCovered: UNFURNISHED_NOT_COVERED },
          { id: 'deep-uf-2bhk', title: '2 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 4599, mrp: 5695, priceUnit: 'per visit', covered: UNFURNISHED_COVERED, notCovered: UNFURNISHED_NOT_COVERED },
          { id: 'deep-uf-3bhk', title: '3 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 5599, mrp: 6645, priceUnit: 'per visit', covered: UNFURNISHED_COVERED, notCovered: UNFURNISHED_NOT_COVERED },
          { id: 'deep-uf-4bhk', title: '4 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 6899, mrp: 7995, priceUnit: 'per visit', covered: UNFURNISHED_COVERED, notCovered: UNFURNISHED_NOT_COVERED },
          { id: 'deep-uf-5bhk', title: '5 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 8079, mrp: 9080, priceUnit: 'per visit', covered: UNFURNISHED_COVERED, notCovered: UNFURNISHED_NOT_COVERED },
        ]
      },
      {
        id: 'deep-furnished', title: 'Furnished House', icon: 'fa-couch',
        subtitle: 'Premium deep clean',
        children: [
          { id: 'deep-f-1bhk', title: '1 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 4099, mrp: 5437, priceUnit: 'per visit', covered: FURNISHED_COVERED, notCovered: FURNISHED_NOT_COVERED, addons: FURNISHED_ADDONS },
          { id: 'deep-f-2bhk', title: '2 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 5099, mrp: 5796, priceUnit: 'per visit', covered: FURNISHED_COVERED, notCovered: FURNISHED_NOT_COVERED, addons: FURNISHED_ADDONS },
          { id: 'deep-f-3bhk', title: '3 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 5799, mrp: 6296, priceUnit: 'per visit', covered: FURNISHED_COVERED, notCovered: FURNISHED_NOT_COVERED, addons: FURNISHED_ADDONS },
          { id: 'deep-f-4bhk', title: '4 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 7099, mrp: 8196, priceUnit: 'per visit', covered: FURNISHED_COVERED, notCovered: FURNISHED_NOT_COVERED, addons: FURNISHED_ADDONS },
          { id: 'deep-f-5bhk', title: '5 BHK', icon: 'fa-home', isLeaf: true, isFixed: true, price: 8299, mrp: 9462, priceUnit: 'per visit', covered: FURNISHED_COVERED, notCovered: FURNISHED_NOT_COVERED, addons: FURNISHED_ADDONS },
        ]
      },
    ]
  },
  {
    id: 'bathroom', title: 'Bathroom Cleaning', icon: 'fa-bath',
    subtitle: 'Per bathroom · Descaling & sanitising',
    isLeaf: true, isFixed: true, price: 499, priceUnit: 'per bathroom',
  },
  {
    id: 'kitchen', title: 'Kitchen Deep Cleaning', icon: 'fa-utensils',
    subtitle: 'Occupied & Empty kitchen packages · from ₹1,299',
    children: [
      {
        id: 'kitchen-occupied', title: 'Occupied Kitchen Package', icon: 'fa-utensils',
        subtitle: 'In-use kitchen · includes utensil re-arrangement',
        children: [
          { id: 'kitchen-occ-base',           title: 'Occupied Kitchen',      icon: 'fa-utensils',  isLeaf: true, isFixed: true, price: 1499, priceUnit: 'per visit', covered: kitchenCovered(true) },
          { id: 'kitchen-occ-chimney',        title: 'With Chimney',          icon: 'fa-fan',       isLeaf: true, isFixed: true, price: 1899, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY]) },
          { id: 'kitchen-occ-chimney-fridge', title: 'With Chimney & Fridge', icon: 'fa-snowflake', isLeaf: true, isFixed: true, price: 2399, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE]) },
          { id: 'kitchen-occ-all',            title: 'With All Appliances',   icon: 'fa-blender',   isLeaf: true, isFixed: true, price: 2699, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE, KITCHEN_APPLIANCES]) },
        ]
      },
      {
        id: 'kitchen-empty', title: 'Empty Kitchen Package', icon: 'fa-box-open',
        subtitle: 'Cleared kitchen · best value',
        children: [
          { id: 'kitchen-emp-base',           title: 'Empty Kitchen',         icon: 'fa-box-open',  isLeaf: true, isFixed: true, price: 1299, priceUnit: 'per visit', covered: kitchenCovered(false) },
          { id: 'kitchen-emp-chimney',        title: 'With Chimney',          icon: 'fa-fan',       isLeaf: true, isFixed: true, price: 1699, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY]) },
          { id: 'kitchen-emp-chimney-fridge', title: 'With Chimney & Fridge', icon: 'fa-snowflake', isLeaf: true, isFixed: true, price: 2099, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE]) },
          { id: 'kitchen-emp-all',            title: 'With All Appliances',   icon: 'fa-blender',   isLeaf: true, isFixed: true, price: 2499, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE, KITCHEN_APPLIANCES]) },
        ]
      },
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
    subtitle: 'Floor-only deep clean · from ₹2,499',
    children: [
      {
        id: 'floor-unfurnished', title: 'Unfurnished House', icon: 'fa-house-chimney',
        subtitle: 'Floor deep cleaning with machine',
        children: floorTiers('Unfurnished', [2499, 2899, 3299, 3799, 4199]),
      },
      {
        id: 'floor-furnished', title: 'Furnished House', icon: 'fa-couch',
        subtitle: 'Floor deep cleaning with machine',
        children: floorTiers('Furnished', [2599, 2999, 3699, 3999, 4499]),
      },
    ],
  },
];

// ─── Service card aliases ─────────────────────────────────────────────────────
// Some homepage cards are marketing entry points rather than their own catalog.
// They open an existing catalog straight away but keep their own heading, so a
// visitor who clicked "Bungalow Cleaning" doesn't suddenly see "Deep Cleaning".
const SERVICE_ALIASES = {
  home:     { target: 'deep', title: 'Home Cleaning' },
  bungalow: { target: 'deep', title: 'Bungalow Cleaning' },
};

// ─── State ────────────────────────────────────────────────────────────────────
let _selectedService = null;
let _step = 0; // 0=catalog, 1=details, 2=address, 3=summary+CTA
let _quantity = 1;
let _currentCatalog = null;
let _entryTitle = null;      // heading to show for the aliased entry level
let _entryCatalogId = null;  // catalog id the heading applies to

const WHATSAPP_NUMBER = '919613304724'; // wa.me format: no + prefix

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTotal() {
  if (!_selectedService?.isFixed) return null;
  return _selectedService.price * _quantity;
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

// ─── WhatsApp message helpers ─────────────────────────────────────────────────

/** Full trail of nodes from a top-level catalog down to `id`. */
function servicePath(id, catalog = SERVICE_CATALOG, trail = []) {
  for (const item of catalog) {
    const next = [...trail, item];
    if (item.id === id) return next;
    if (item.children) {
      const found = servicePath(id, item.children, next);
      if (found) return found;
    }
  }
  return null;
}

/** Indian-format money, e.g. 4599 -> "4,599". */
const inr = n => Number(n).toLocaleString('en-IN');

/** Does this package charge per unit (per bathroom/seat) rather than per visit? */
function hasQuantity(svc) {
  return !!(svc.isFixed && svc.priceUnit?.startsWith('per ') && !svc.priceUnit?.includes('visit'));
}

/** Short human reference so the office can track the enquiry. */
function enquiryRef() {
  return 'MNU-' + Date.now().toString(36).slice(-5).toUpperCase();
}

/** Renders a bullet list, trimming very long lists to keep the URL sane. */
function bulletList(items, max = 12) {
  const shown = items.slice(0, max).map(i => `• ${i}`);
  if (items.length > max) shown.push(`• …and ${items.length - max} more`);
  return shown;
}

// ─── Build WhatsApp message ───────────────────────────────────────────────────
function buildWhatsAppMessage(guestName, guestPhone, guestEmail) {
  const svc   = _selectedService;
  const total = getTotal();
  const qty   = hasQuantity(svc) ? _quantity : 1;
  const unit  = svc.priceUnit ? svc.priceUnit.replace(/^per\s+/, '') : 'visit';

  // Full drill-down path, e.g. Deep Cleaning > Unfurnished House > 2 BHK
  const path  = servicePath(svc.id) || [svc];
  const crumb = path.map(n => n.title).join(' > ');

  // If the visitor arrived via a marketing card (Home/Bungalow), record that
  // so the office knows what the customer believes they booked.
  const viaAlias = _entryTitle && path[0] && _entryTitle !== path[0].title
    ? _entryTitle
    : null;

  const now = new Date();
  const when = now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(/\b(am|pm)\b/i, m => m.toUpperCase());

  const SEP = '- - - - - - - - - - - - - - -';
  const L = [];

  L.push('*NEW BOOKING ENQUIRY*');
  L.push('_MyNeedUrban Cleaning Services_');
  L.push(SEP);
  L.push('');

  // ── Service
  L.push('*SERVICE*');
  L.push(crumb);
  if (viaAlias) L.push(`_(enquired via "${viaAlias}")_`);
  L.push('');

  // ── Pricing
  L.push('*PRICING*');
  if (svc.isFixed) {
    if (qty > 1) {
      L.push(`Rate: ₹${inr(svc.price)} per ${unit}`);
      L.push(`Quantity: ${qty} ${unit}${qty > 1 ? 's' : ''}`);
      L.push(`*Total: ₹${inr(total)}*`);
    } else {
      L.push(`*Total: ₹${inr(total)}* (per ${unit})`);
    }
    if (svc.mrp) {
      const saved = svc.mrp - svc.price;
      const pct   = Math.round((saved / svc.mrp) * 100);
      L.push(`MRP ₹${inr(svc.mrp)} — you save ₹${inr(saved * qty)} (${pct}% off)`);
    }
    L.push('_Pay after the service is completed._');
  } else {
    L.push('Custom quote — to be confirmed');
    L.push('_Our team will review the details and share a quotation._');
  }
  L.push('');

  // ── What's included / excluded
  if (svc.covered?.length) {
    L.push('*INCLUDED*');
    L.push(...bulletList(svc.covered));
    L.push('');
  }
  if (svc.notCovered?.length) {
    L.push('*NOT INCLUDED*');
    L.push(...bulletList(svc.notCovered, 12));
    L.push('');
  }
  if (svc.addons?.length) {
    L.push('*OPTIONAL ADD-ONS* (charged extra)');
    L.push(...bulletList(svc.addons, 6));
    L.push('');
  }

  // ── Address (preserve the customer's own line breaks)
  L.push('*SERVICE ADDRESS*');
  const addr = (window._bookingAddress || '').trim();
  if (addr) addr.split(/\r?\n/).forEach(l => l.trim() && L.push(l.trim()));
  else L.push('(not provided)');
  L.push('');

  // ── Customer notes / requirement
  const notes = (window._bookingNotes || '').trim();
  if (notes) {
    L.push(svc.isFixed ? '*CUSTOMER NOTES*' : '*REQUIREMENT DETAILS*');
    notes.split(/\r?\n/).forEach(l => l.trim() && L.push(l.trim()));
    L.push('');
  }

  // ── Contact
  L.push('*CONTACT DETAILS*');
  L.push(`Name: ${guestName || '(not provided)'}`);
  L.push(`Phone: ${guestPhone ? (guestPhone.startsWith('+') ? guestPhone : '+91 ' + guestPhone) : '(not provided)'}`);
  if (guestEmail) L.push(`Email: ${guestEmail}`);
  L.push('');

  // ── Footer
  L.push(SEP);
  L.push(`Ref: ${enquiryRef()}`);
  L.push(`Requested: ${when}`);
  L.push('_Sent from myneedurban.com_');

  return encodeURIComponent(L.join('\n'));
}

// ─── Open booking (no login required — user can explore freely) ───────────────
export function openBooking(serviceId) {
  _step = 0;
  _selectedService = null;
  _quantity = 1;
  _currentCatalog = null;
  _entryTitle = null;
  _entryCatalogId = null;
  window._bookingAddress = '';
  window._bookingNotes = '';

  if (serviceId) {
    // Resolve marketing aliases (e.g. "home"/"bungalow" → the deep-clean catalog)
    const alias = SERVICE_ALIASES[serviceId];
    const lookupId = alias ? alias.target : serviceId;

    const found = findService(lookupId, SERVICE_CATALOG);
    if (found) {
      if (found.isLeaf) { _selectedService = found; _step = 1; }
      else {
        _currentCatalog = found;
        if (alias) { _entryTitle = alias.title; _entryCatalogId = found.id; }
      }
    }
  }
  document.getElementById('bookingModal')?.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  renderBookingStep();
}

// ─── Render dispatcher ────────────────────────────────────────────────────────
function renderBookingStep() {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;
  const body     = modal.querySelector('.booking-body');
  const progress = modal.querySelector('.booking-progress');
  const title    = modal.querySelector('.booking-title');

  if (_step === 0) {
    // Show the entry card's own name at the level it opened; deeper levels use
    // the real catalog title.
    title.textContent = _currentCatalog
      ? (_entryTitle && _currentCatalog.id === _entryCatalogId ? _entryTitle : _currentCatalog.title)
      : 'Select a Service';
    progress.innerHTML = renderProgress(0);
    body.innerHTML = renderCatalogHTML(_currentCatalog ? _currentCatalog.children : SERVICE_CATALOG);
    attachCatalogEvents(body);
  } else if (_step === 1) {
    title.textContent = _selectedService.isFixed ? 'Package Details' : 'Request a Quote';
    progress.innerHTML = renderProgress(1);
    body.innerHTML = renderDetailsStep();
    attachDetailsEvents(body);
  } else if (_step === 2) {
    title.textContent = 'Your Address';
    progress.innerHTML = renderProgress(2);
    body.innerHTML = renderAddressStep();
  } else if (_step === 3) {
    title.textContent = 'Get in Touch';
    progress.innerHTML = renderProgress(3);
    body.innerHTML = renderSummaryStep();
    attachSummaryEvents(body);
  }
}

function renderProgress(active) {
  const steps = ['Service', 'Details', 'Address', 'Contact'];
  return steps.map((s, i) => `
    <div class="bp-step ${i <= active ? 'active' : ''} ${i < active ? 'done' : ''}">
      <div class="bp-dot">${i < active ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
      <span>${s}</span>
    </div>
    ${i < steps.length - 1 ? `<div class="bp-line ${i < active ? 'active' : ''}"></div>` : ''}
  `).join('');
}

// ─── Step 0: Catalog ──────────────────────────────────────────────────────────
function renderCatalogHTML(items) {
  return `<div class="catalog-list">${items.map(item => `
    <div class="catalog-item" data-id="${item.id}" data-leaf="${item.isLeaf || false}">
      <div class="ci-icon"><i class="fa-solid ${item.icon}"></i></div>
      <div class="ci-info">
        <strong>${item.title}</strong>
        ${item.subtitle ? `<small>${item.subtitle}</small>` : ''}
      </div>
      ${item.isLeaf && item.isFixed
        ? `<div class="ci-price-wrap">
            ${item.mrp ? `<span class="ci-mrp">₹${item.mrp}</span>` : ''}
            <span class="ci-price">₹${item.price}</span>
           </div>`
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
      if (isLeaf) { _selectedService = node; _step = 1; }
      else { _currentCatalog = node; _step = 0; }
      renderBookingStep();
    });
  });
}

// ─── Step 1: Details (package info + quantity, no time slot) ─────────────────
function renderDetailsStep() {
  const svc = _selectedService;
  const hasQty = svc.isFixed && svc.priceUnit?.startsWith('per ') && !svc.priceUnit?.includes('visit');
  const unitLabel = hasQty ? svc.priceUnit.replace('per ', '') + 's' : '';
  const covered    = svc.covered    || [];
  const notCovered = svc.notCovered || [];
  const addons     = svc.addons     || [];

  return `
    <div class="service-header-chip">
      <i class="fa-solid ${svc.icon}"></i>
      <span>${svc.title}</span>
      ${svc.isFixed
        ? `<div class="chip-price">
            ${svc.mrp ? `<s class="chip-mrp">₹${svc.mrp}</s>` : ''}
            <strong>₹${svc.price}</strong>
           </div>`
        : '<strong>Get a Quote</strong>'}
    </div>

    ${covered.length ? `
    <div class="covered-section">
      <div class="covered-title"><i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> What's Included</div>
      <ul class="covered-list">
        ${covered.map(c => `<li><i class="fa-solid fa-check"></i> ${c}</li>`).join('')}
      </ul>
      ${notCovered.length ? `
      <div class="covered-title" style="margin-top:12px;"><i class="fa-solid fa-circle-xmark" style="color:#94a3b8;"></i> Not Included</div>
      <ul class="not-covered-list">
        ${notCovered.map(c => `<li><i class="fa-solid fa-xmark"></i> ${c}</li>`).join('')}
      </ul>` : ''}
      ${addons.length ? `
      <div class="covered-title" style="margin-top:12px;"><i class="fa-solid fa-plus-circle" style="color:var(--orange-500);"></i> Please Note</div>
      <ul class="addons-list">
        ${addons.map(a => `<li><i class="fa-solid fa-info-circle"></i> ${a}</li>`).join('')}
      </ul>` : ''}
    </div>` : ''}

    ${hasQty ? `
    <div class="step-section">
      <label class="step-label">Number of ${unitLabel}</label>
      <div class="qty-row">
        <button class="qty-btn" id="qtyMinus"><i class="fa-solid fa-minus"></i></button>
        <span class="qty-val" id="qtyVal">${_quantity}</span>
        <button class="qty-btn" id="qtyPlus"><i class="fa-solid fa-plus"></i></button>
        <span class="qty-total">Total: ₹${svc.price * _quantity}</span>
      </div>
    </div>` : ''}

    <div class="step-btns">
      <button class="btn btn-outline" id="backToCatalog"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toAddressStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

function attachDetailsEvents(body) {
  body.querySelector('#qtyMinus')?.addEventListener('click', () => {
    if (_quantity > 1) { _quantity--; renderBookingStep(); }
  });
  body.querySelector('#qtyPlus')?.addEventListener('click', () => {
    _quantity++;
    renderBookingStep();
  });
  body.querySelector('#backToCatalog')?.addEventListener('click', () => {
    _step = 0;
    renderBookingStep();
  });
  body.querySelector('#toAddressStep')?.addEventListener('click', () => {
    _step = 2;
    renderBookingStep();
  });
}

// ─── Step 2: Address ──────────────────────────────────────────────────────────
function renderAddressStep() {
  return `
    <div class="step-section">
      <label class="step-label">Your Address</label>
      <textarea class="field-input" id="bookingAddress" rows="3"
        placeholder="Flat/House No., Building, Street, Area...">${window._bookingAddress || ''}</textarea>
    </div>
    <div class="step-section">
      <label class="step-label">${_selectedService.isFixed ? 'Notes (optional)' : 'Describe your requirement'}</label>
      <textarea class="field-input" id="bookingNotes" rows="3"
        placeholder="${_selectedService.requirementHint || 'Any special instructions?'}">${window._bookingNotes || ''}</textarea>
    </div>
    <div class="info-chip"><i class="fa-solid fa-location-dot"></i> We serve all of Hyderabad &amp; Telangana</div>
    <div class="step-btns">
      <button class="btn btn-outline" id="backToDetails"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toSummaryStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

// ─── Step 3: Summary + WhatsApp / Call CTA ────────────────────────────────────
function renderSummaryStep() {
  const svc   = _selectedService;
  const total = getTotal();

  return `
    <div class="confirm-rows">
      <div class="confirm-row"><span>Service</span><strong>${svc.title}</strong></div>
      ${_quantity > 1 ? `<div class="confirm-row"><span>Qty</span><strong>${_quantity}</strong></div>` : ''}
      ${svc.isFixed
        ? `<div class="confirm-row"><span>Price</span>
             <strong>₹${total}${svc.mrp ? ` <span class="save-badge">Save ₹${svc.mrp - svc.price}</span>` : ''}</strong>
           </div>`
        : `<div class="confirm-row"><span>Pricing</span><strong>Custom Quote</strong></div>`}
      <div class="confirm-row"><span>Address</span><strong>${window._bookingAddress || '-'}</strong></div>
      ${window._bookingNotes ? `<div class="confirm-row"><span>Notes</span><strong>${window._bookingNotes}</strong></div>` : ''}
    </div>

    ${svc.isFixed
      ? `<div class="confirm-total fixed">
           <small><i class="fa-solid fa-hand-holding-heart"></i> Pay after service — cash or UPI</small>
         </div>`
      : `<div class="confirm-total quote">
           <div class="quote-note"><i class="fa-solid fa-comment-dots"></i> We'll share a custom quote after reviewing your requirement</div>
         </div>`}

    <p class="cta-heading">How would you like to connect?</p>

    <div class="cta-btns">
      <button class="btn btn-whatsapp" id="ctaWhatsapp">
        <i class="fa-brands fa-whatsapp"></i> Send on WhatsApp
      </button>
      <a class="btn btn-call" href="tel:+919613304724" id="ctaCall">
        <i class="fa-solid fa-phone"></i> Call Us
      </a>
    </div>

    <!-- WhatsApp guest/login chooser (hidden by default) -->
    <div class="wa-options" id="waOptions" style="display:none;">
      <p class="wa-options-label">Continue as</p>
      <div class="wa-option-btns">
        <button class="btn btn-outline" id="waAsGuest">
          <i class="fa-solid fa-user"></i> Guest
        </button>
        <button class="btn btn-primary" id="waAsLogin">
          <i class="fa-solid fa-circle-user"></i> Login / Sign Up
        </button>
      </div>
      <div id="waGuestForm" style="display:none;">
        <div class="field" style="margin-top:10px;">
          <label>Your Name</label>
          <input class="field-input" id="waGuestName" type="text" placeholder="Full name" />
        </div>
        <div class="field" style="margin-top:8px;">
          <label>Phone Number</label>
          <input class="field-input" id="waGuestPhone" type="tel" placeholder="10-digit mobile" maxlength="10" />
        </div>
        <button class="btn btn-whatsapp w-100" id="waGuestSend" style="margin-top:10px;">
          <i class="fa-brands fa-whatsapp"></i> Open WhatsApp
        </button>
      </div>
    </div>

    <div class="step-btns" style="margin-top:16px;">
      <button class="btn btn-outline" id="backToAddress"><i class="fa-solid fa-arrow-left"></i> Back</button>
    </div>
  `;
}

function attachSummaryEvents(body) {
  // Back
  body.querySelector('#backToAddress')?.addEventListener('click', () => {
    _step = 2;
    renderBookingStep();
  });

  // WhatsApp button — if already logged in send directly, else show options
  body.querySelector('#ctaWhatsapp')?.addEventListener('click', () => {
    const user = auth.currentUser;
    if (user) {
      const name  = window._userProfile?.name  || user.displayName || '';
      const phone = window._userProfile?.phone || user.phoneNumber  || '';
      const email = window._userProfile?.email || user.email        || '';
      const msg   = buildWhatsAppMessage(name, phone, email);
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
      return;
    }
    const waOptions = body.querySelector('#waOptions');
    waOptions.style.display = waOptions.style.display === 'none' ? 'block' : 'none';
  });

  // Guest option — show guest form
  body.querySelector('#waAsGuest')?.addEventListener('click', () => {
    body.querySelector('#waGuestForm').style.display = 'block';
    body.querySelector('#waAsGuest').style.display = 'none';
    body.querySelector('#waAsLogin').style.display = 'none';
  });

  // Login option — open auth modal, close booking modal
  body.querySelector('#waAsLogin')?.addEventListener('click', () => {
    document.getElementById('bookingModal').classList.remove('modal-open');
    document.body.style.overflow = '';
    openModal('authModal');
  });

  // Guest send — open WhatsApp with pre-filled message
  body.querySelector('#waGuestSend')?.addEventListener('click', () => {
    const name  = body.querySelector('#waGuestName')?.value.trim();
    const phone = body.querySelector('#waGuestPhone')?.value.trim();
    if (!name)  { showToast('Please enter your name'); return; }
    if (!phone || phone.length !== 10) { showToast('Enter a valid 10-digit number'); return; }
    const msg = buildWhatsAppMessage(name, phone);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  });
}

// ─── DOM wiring ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Service cards / "Book Now" buttons
  document.querySelectorAll('[data-book]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openBooking(el.dataset.book);
    });
  });

  const modal = document.getElementById('bookingModal');
  if (!modal) return;

  // Address / notes live capture
  modal.addEventListener('input', (e) => {
    if (e.target.id === 'bookingAddress') window._bookingAddress = e.target.value;
    if (e.target.id === 'bookingNotes')   window._bookingNotes   = e.target.value;
  });

  // Delegated navigation for address step buttons
  modal.addEventListener('click', (e) => {
    if (e.target.closest('#backToDetails')) {
      window._bookingAddress = document.getElementById('bookingAddress')?.value || '';
      window._bookingNotes   = document.getElementById('bookingNotes')?.value   || '';
      _step = 1;
      renderBookingStep();
    }
    if (e.target.closest('#toSummaryStep')) {
      window._bookingAddress = document.getElementById('bookingAddress')?.value || '';
      window._bookingNotes   = document.getElementById('bookingNotes')?.value   || '';
      if (!window._bookingAddress?.trim()) { showToast('Please enter your address'); return; }
      _step = 3;
      renderBookingStep();
    }
  });

  // Close modal
  modal.querySelector('[data-close-modal]')?.addEventListener('click', () => {
    modal.classList.remove('modal-open');
    document.body.style.overflow = '';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('modal-open');
      document.body.style.overflow = '';
    }
  });
});
