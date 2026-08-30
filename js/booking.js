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

/** Empty kitchens: nothing to move, so a shorter scope. */
const KITCHEN_EMPTY_COVERED = [
  'Cleaning of tiles, slabs, sink and windows',
  'Cabinet cleaning — Interior & Exterior, incl. oil stain removal',
  'Gas stove & hob cleaning',
];

/** Occupied kitchens: utensils handled, plus floors and switchboards. */
const KITCHEN_OCCUPIED_COVERED = [
  'Utensil removal & rearrangement included',
  'Cleaning of kitchen floors, tiles, slabs, sink and windows',
  'Switchboard & fixtures cleaning',
  'Cabinet cleaning — Interior & Exterior, incl. oil stain removal',
  'Gas stove & hob cleaning',
];

const KITCHEN_NOT_COVERED = [
  'Any repair or electrician related work',
  'Trolley & cabinet dismantling',
  'Wet wiping of ceiling & walls',
  'Cleaning of the chimney motor',
  'Cleaning of commercial kitchens',
  'Interior cleaning & filter removal of automatic chimneys',
];

const KITCHEN_PROVIDES = ['Bucket & water', 'Power point', 'Ladder or stool'];

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
  ...(occupied ? KITCHEN_OCCUPIED_COVERED : KITCHEN_EMPTY_COVERED),
  ...extras,
];

/** Every kitchen tier shares the same exclusions and prerequisites. */
const kitchenLeaf = (node) => ({
  ...node,
  notCovered: KITCHEN_NOT_COVERED,
  customerProvides: KITCHEN_PROVIDES,
});

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

// ─── Newly interior-completed house deep cleaning ─────────────────────────────
// Post-handover clean: removes the marks interior work leaves behind.

const INTERIOR_COVERED = [
  'Sticker & sticker-residue removal',
  'Blue marking removal',
  'Paan stain removal',
  'Paint mark removal',
  'Hall & bedroom wardrobe Interior & Exterior cleaning',
  'Windows, fans, switchboards & doors — wet wiping & dusting',
  'Kitchen cabinets Interior & Exterior cleaning',
  'Bathroom deep cleaning & balcony cleaning',
  'Floor deep cleaning with machine',
];

const INTERIOR_NOT_COVERED = [
  'Removal of interior-work debris or leftover material',
  'Heavy or set-in stains',
  'Wet wiping of walls & ceiling',
  'Cleaning of terrace & inaccessible areas',
];

const INTERIOR_NOTES = [
  'One member of the family needs to be present at the property throughout the day while our team is working.',
  "If your home's size isn't listed, choose \"Other\" — we'll visit the site and share a quotation.",
];

const INTERIOR_PROVIDES = [
  'Bucket & water',
  'Power point',
  'Drinking water',
  'Ladder or stool (optional)',
];

/** Builds a post-interior tier. Pass price = null for the quote-based option. */
const interiorTier = (id, title, subtitle, price, extra = {}) => ({
  id,
  title,
  subtitle,
  icon: price ? 'fa-paint-roller' : 'fa-ruler-combined',
  isLeaf: true,
  isFixed: !!price,
  ...(price ? { price, priceUnit: 'per visit' } : {}),
  covered: INTERIOR_COVERED,
  notCovered: INTERIOR_NOT_COVERED,
  notes: INTERIOR_NOTES,
  customerProvides: INTERIOR_PROVIDES,
  ...extra,
});

// ─── Premium bungalow / villa deep cleaning ───────────────────────────────────
// Priced by built-up area, not BHK — a bungalow is a different job to a flat.

const BUNGALOW_COMMON_COVERED = [
  'Cobweb removal & wall dusting',
  'Kitchen cabinets Interior & Exterior wet scrubbing & wiping',
  'Chimney Exterior & Filter Cleaning',
  'Bathroom Deep Cleaning',
  'Balcony Cleaning',
  'Staircase, railing & glass cleaning',
  'Floor Deep Cleaning with Machine',
  'External / exterior parking floor basic cleaning',
];

const BUNGALOW_FURNISHED_COVERED = [
  'Hall & Bedroom wardrobe Exterior wet wiping',
  'Windows, ceiling fan, AC, switchboard, doors & furniture — Dry & wet wiping',
  'Sofa, carpet & mattress dry vacuuming',
  ...BUNGALOW_COMMON_COVERED,
];

const BUNGALOW_UNFURNISHED_COVERED = [
  'Hall & Bedroom wardrobe Interior & Exterior wet wiping',
  'Windows, ceiling fan, AC, switchboard & doors — Dry & wet wiping',
  ...BUNGALOW_COMMON_COVERED,
];

const BUNGALOW_NOT_COVERED = [
  'Glue / paint stains / sticker removal',
  'Cleaning of terrace & inaccessible areas',
  'Wet wiping of walls & ceiling',
];

const BUNGALOW_FURNISHED_ADDONS = [
  'Fridge, microwave & oven cleaning — additional price',
  'Sofa, carpet & dining chair shampooing — additional price',
  'Bedroom & hall wardrobe interior cleaning — additional price',
  'Villa exterior complete floor cleaning — additional price',
  'Terrace cleaning — additional price',
];

const BUNGALOW_UNFURNISHED_ADDONS = [
  'Newly completed villa cleaning — additional price',
  'Villa exterior complete floor cleaning — additional price',
  'Terrace cleaning — additional price',
];

/** Area bands, in display order. */
const BUNGALOW_BANDS = [
  'Up to 1200 sq ft',
  '1200 – 2000 sq ft',
  '2000 – 3000 sq ft',
  '3000 – 4000 sq ft',
  '4000 – 5000 sq ft',
  '5000 – 6000 sq ft',
  '6000 – 6800 sq ft',
];

/**
 * Builds the 7 area tiers for a furnishing type.
 * @param {string} furnish - 'Furnished' | 'Unfurnished'
 * @param {Array<[number, number]>} pairs - [sellingPrice, mrp] per band
 */
const bungalowTiers = (furnish, pairs) =>
  BUNGALOW_BANDS.map((band, i) => {
    const [price, mrp] = pairs[i];
    const isFurnished = furnish === 'Furnished';
    return {
      id: `bungalow-${furnish.toLowerCase()}-${i + 1}`,
      title: band,
      subtitle: `${furnish} bungalow / villa`,
      icon: 'fa-ruler-combined',
      isLeaf: true,
      isFixed: true,
      price,
      mrp,
      priceUnit: 'per visit',
      covered: isFurnished ? BUNGALOW_FURNISHED_COVERED : BUNGALOW_UNFURNISHED_COVERED,
      notCovered: BUNGALOW_NOT_COVERED,
      addons: isFurnished ? BUNGALOW_FURNISHED_ADDONS : BUNGALOW_UNFURNISHED_ADDONS,
    };
  });

// ─── Shared wet-shampoo process (sofa · mattress · carpet) ────────────────────

/** Things the customer must arrange before the crew arrives. */
const WET_CLEAN_PROVIDES = ['Bucket & water', 'Power point'];

/**
 * The four-stage shampoo process, worded for the item being cleaned.
 * @param {string} item    - what dries at the end (sofa / mattress / carpet)
 * @param {string} vacLine - first-stage wording (carpet mentions fibres & crumbs)
 */
const shampooProcess = (item, vacLine) => [
  vacLine,
  'Wet shampooing — lifts stains via foam-based shampooing with professional tools',
  'Wet vacuuming & rinsing — extracts residual moisture and foam',
  `Surface drying — ${item} dries under a fan in 3–4 hrs`,
];

const UPHOLSTERY_VAC = 'Dry vacuuming — removes dust & dirt from surfaces, corners and crevices';

// ── Sofa: priced by TOTAL seat count across all sofas, not per sofa.
const SOFA_COVERED = shampooProcess('sofa', UPHOLSTERY_VAC);
const SOFA_NOT_COVERED = ['Removal of paint or ink stains'];
const SOFA_ADDONS = [
  'Pillows — additional price',
  'Ottoman / stool — additional price',
  'Cushions — additional price',
  'Sofa centre table — additional price',
];

// ── Mattress
const MATTRESS_COVERED = shampooProcess('mattress', UPHOLSTERY_VAC);
const MATTRESS_NOT_COVERED = [
  'Removal of paint or ink stains',
  'Removal of heavy stains',
];

// ── Carpet (home carpets only — office carpets are a separate package)
const CARPET_COVERED = shampooProcess(
  'carpet',
  'Carpet dry vacuuming — removes dust, dirt & crumbs from carpet fibres'
);
const CARPET_NOT_COVERED = [
  'Removal of paint or ink stains',
  'Removal of heavy stains',
];
const CARPET_NOTES = [
  'Home carpets only',
  'Office carpets are booked under the Office Carpet Shampooing package',
];

/** Builds a carpet tier priced by area band. */
const carpetTier = (label, range, price) => ({
  id: `carpet-${label.toLowerCase().replace(/\s+/g, '-')}`,
  title: `${label} (${range} sq ft)`,
  subtitle: 'Home carpet',
  icon: 'fa-rug',
  isLeaf: true,
  isFixed: true,
  price,
  priceUnit: 'per visit',
  covered: CARPET_COVERED,
  notCovered: CARPET_NOT_COVERED,
  notes: CARPET_NOTES,
  customerProvides: WET_CLEAN_PROVIDES,
});

// ─── Bathroom deep cleaning ───────────────────────────────────────────────────
const BATHROOM_COVERED = [
  'Hard water stains',
  'Toilet seat — outside & inside',
  'Sink, tiles, taps & other fixtures',
  'Mirrors, windows & glass partition',
  'Exhaust fan & other hard-to-reach areas',
  'Grouting on top of the tiles',
];
const BATHROOM_NOT_COVERED = [
  'Re-grouting or grouting deep inside tile joints',
  'Cement & rust stains',
  'Cabinet interiors, buckets, mugs & stools',
  'Dismantling & cleaning of any appliance',
];
const BATHROOM_ADDONS = [
  'Cement stain removal — additional price',
  'Paint drop removal — additional price',
];
const BATHROOM_PROVIDES = ['Bucket & water', 'Power point', 'Ladder or stool'];

/** Builds a sofa tier priced by total seat count. */
const sofaTier = (seats, price) => ({
  id: `sofa-${seats}-seats`,
  title: `${seats} Seats`,
  subtitle: 'Total seats across all sofas',
  icon: 'fa-couch',
  isLeaf: true,
  isFixed: true,
  price,
  priceUnit: 'per visit',
  covered: SOFA_COVERED,
  notCovered: SOFA_NOT_COVERED,
  addons: SOFA_ADDONS,
  customerProvides: WET_CLEAN_PROVIDES,
});

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
    id: 'interior-done', title: 'Newly Interior-Completed House', icon: 'fa-paint-roller',
    subtitle: 'Post-handover deep clean · from ₹5,499',
    children: [
      interiorTier('interior-1bhk', '1 BHK', 'Up to 700 sq ft',  5499),
      interiorTier('interior-2bhk', '2 BHK', 'Up to 1200 sq ft', 7499),
      interiorTier('interior-3bhk', '3 BHK', 'Up to 1800 sq ft', 9499),
      interiorTier('interior-4bhk', '4 BHK', 'Up to 2400 sq ft', 13999),
      interiorTier('interior-5bhk', '5 BHK', 'Up to 2800 sq ft', 17999),
      interiorTier('interior-other', 'Other / Larger Home', 'Site visit, then quotation', null, {
        requirementHint: 'Tell us your BHK and approximate built-up area (sq ft), and we\'ll arrange a site visit.',
      }),
    ],
  },
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
    id: 'bungalow', title: 'Bungalow / Villa Cleaning', icon: 'fa-building',
    subtitle: 'Premium package · priced by area · from ₹5,799',
    children: [
      {
        id: 'bungalow-unfurnished', title: 'Unfurnished Bungalow', icon: 'fa-house-chimney',
        subtitle: 'Premium deep clean',
        children: bungalowTiers('Unfurnished', [
          [5799,  6373],
          [8319,  8906],
          [12299, 13324],
          [15999, 16829],
          [19000, 20117],
          [24199, 25629],
          [26599, 29265],
        ]),
      },
      {
        id: 'bungalow-furnished', title: 'Furnished Bungalow', icon: 'fa-couch',
        subtitle: 'Premium deep clean',
        children: bungalowTiers('Furnished', [
          [6199,  7360],
          [8699,  10362],
          [13999, 15234],
          [16999, 18142],
          [22199, 24881],
          [25199, 27213],
          [29999, 34581],
        ]),
      },
    ],
  },
  {
    id: 'bathroom', title: 'Bathroom Cleaning', icon: 'fa-bath',
    subtitle: 'Per bathroom · Descaling & sanitising',
    isLeaf: true, isFixed: true, price: 499, priceUnit: 'per bathroom',
    covered: BATHROOM_COVERED,
    notCovered: BATHROOM_NOT_COVERED,
    addons: BATHROOM_ADDONS,
    customerProvides: BATHROOM_PROVIDES,
  },
  {
    id: 'kitchen', title: 'Kitchen Deep Cleaning', icon: 'fa-utensils',
    subtitle: 'Occupied & Empty kitchen packages · from ₹1,299',
    children: [
      {
        id: 'kitchen-occupied', title: 'Occupied Kitchen Package', icon: 'fa-utensils',
        subtitle: 'In-use kitchen · includes utensil re-arrangement',
        children: [
          kitchenLeaf({ id: 'kitchen-occ-base',           title: 'Occupied Kitchen',      icon: 'fa-utensils',  isLeaf: true, isFixed: true, price: 1499, priceUnit: 'per visit', covered: kitchenCovered(true) }),
          kitchenLeaf({ id: 'kitchen-occ-chimney',        title: 'With Chimney',          icon: 'fa-fan',       isLeaf: true, isFixed: true, price: 1899, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY]) }),
          kitchenLeaf({ id: 'kitchen-occ-chimney-fridge', title: 'With Chimney & Fridge', icon: 'fa-snowflake', isLeaf: true, isFixed: true, price: 2399, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE]) }),
          kitchenLeaf({ id: 'kitchen-occ-all',            title: 'With All Appliances',   icon: 'fa-blender',   isLeaf: true, isFixed: true, price: 2699, priceUnit: 'per visit', covered: kitchenCovered(true, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE, KITCHEN_APPLIANCES]) }),
        ]
      },
      {
        id: 'kitchen-empty', title: 'Empty Kitchen Package', icon: 'fa-box-open',
        subtitle: 'Cleared kitchen · best value',
        children: [
          kitchenLeaf({ id: 'kitchen-emp-base',           title: 'Empty Kitchen',         icon: 'fa-box-open',  isLeaf: true, isFixed: true, price: 1299, priceUnit: 'per visit', covered: kitchenCovered(false) }),
          kitchenLeaf({ id: 'kitchen-emp-chimney',        title: 'With Chimney',          icon: 'fa-fan',       isLeaf: true, isFixed: true, price: 1699, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY]) }),
          kitchenLeaf({ id: 'kitchen-emp-chimney-fridge', title: 'With Chimney & Fridge', icon: 'fa-snowflake', isLeaf: true, isFixed: true, price: 2099, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE]) }),
          kitchenLeaf({ id: 'kitchen-emp-all',            title: 'With All Appliances',   icon: 'fa-blender',   isLeaf: true, isFixed: true, price: 2499, priceUnit: 'per visit', covered: kitchenCovered(false, [KITCHEN_CHIMNEY, KITCHEN_FRIDGE, KITCHEN_APPLIANCES]) }),
        ]
      },
    ]
  },
  {
    id: 'sofa', title: 'Sofa Cleaning', icon: 'fa-couch',
    subtitle: 'All sofa types · shampoo & deep clean · from ₹599',
    children: [
      sofaTier(3,  599),
      sofaTier(4,  649),
      sofaTier(5,  849),
      sofaTier(6,  949),
      sofaTier(7,  1049),
      sofaTier(8,  1149),
      sofaTier(9,  1249),
      sofaTier(10, 1349),
      sofaTier(12, 1499),
    ],
  },
  {
    id: 'carpet', title: 'Carpet Cleaning', icon: 'fa-rug',
    subtitle: 'Home carpets · by area · from ₹599',
    children: [
      carpetTier('Small',       '25–50',   599),
      carpetTier('Medium',      '50–100',  849),
      carpetTier('Large',       '100–150', 999),
      carpetTier('Extra Large', '150–200', 1199),
    ],
  },
  {
    id: 'mattress', title: 'Mattress Cleaning', icon: 'fa-bed',
    subtitle: 'Per mattress · Shampoo & deep clean',
    isLeaf: true, isFixed: true, price: 699, priceUnit: 'per mattress',
    covered: MATTRESS_COVERED,
    notCovered: MATTRESS_NOT_COVERED,
    customerProvides: WET_CLEAN_PROVIDES,
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
// NOTE: 'bungalow' used to alias to the apartment deep-clean catalog. It now
// has its own area-based catalog, so the alias was removed.
const SERVICE_ALIASES = {
  home: { target: 'deep', title: 'Home Cleaning' },
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

// ─── Address helpers ──────────────────────────────────────────────────────────

const ADDRESS_FIELDS = ['flat', 'building', 'street', 'landmark', 'city', 'pincode'];

/** Blank address record. `geo` is filled only if the customer shares location. */
function emptyAddress() {
  return { flat: '', building: '', street: '', landmark: '', city: 'Hyderabad', pincode: '', lat: null, lng: null };
}

/** Live address record, created on first use. */
function addr() {
  if (!window._bookingAddr) window._bookingAddr = emptyAddress();
  return window._bookingAddr;
}

/** Human-readable multi-line address (also what we store as `address`). */
function composeAddress(a = addr()) {
  const line1 = [a.flat, a.building].filter(Boolean).join(', ');
  const line2 = a.street;
  const line3 = a.landmark ? `Landmark: ${a.landmark}` : '';
  const line4 = [a.city, a.pincode].filter(Boolean).join(' - ');
  return [line1, line2, line3, line4].filter(s => s && s.trim()).join('\n');
}

/** Single-line version for compact display. */
function addressOneLine(a = addr()) {
  return composeAddress(a).split('\n').join(', ');
}

/**
 * What we hand to Google Maps: exact coords if shared, else the typed address.
 * Flat numbers and the "Landmark:" label are left out — they aren't geocodable
 * and measurably worsen the match. Building + street + city + pincode is best.
 */
function mapsQuery(a = addr()) {
  if (a.lat != null && a.lng != null) return `${a.lat},${a.lng}`;
  return [a.building, a.street, a.city, a.pincode].filter(s => s && s.trim()).join(', ');
}

/** Tappable link for the crew — opens the location in Google Maps. */
function mapsLink(a = addr()) {
  const q = mapsQuery(a);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/** Keyless embed URL (same approach as the contact-section map). */
function mapsEmbed(a = addr()) {
  const q = mapsQuery(a);
  if (!q) return '';
  const zoom = (a.lat != null) ? 17 : 14;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`;
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

/**
 * Human-friendly order id: MNU-YYMMDD-XXXX
 * Ambiguous characters (0/O, 1/I/L, 2/Z, 5/S, 8/B) are excluded because staff
 * read these out over the phone.
 */
function makeOrderId() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2)
            + String(d.getMonth() + 1).padStart(2, '0')
            + String(d.getDate()).padStart(2, '0');
  const CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';
  // Crypto-backed randomness where available, so two customers booking in the
  // same second can't land on the same id. 25^5 ≈ 9.8M combos per day.
  const n = 5;
  const bytes = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);

  let tail = '';
  for (let i = 0; i < n; i++) tail += CHARS[bytes[i] % CHARS.length];
  return `MNU-${ymd}-${tail}`;
}

/**
 * Persists the enquiry so it shows up in the customer's profile and the
 * admin dashboard. Returns the Firestore doc id.
 *
 * Note: the order id is generated by the caller *before* this runs, so the
 * WhatsApp window can be opened synchronously inside the click handler
 * (opening it after an await gets blocked by popup blockers).
 */
async function saveBooking({ orderId, name, phone, email }) {
  const svc  = _selectedService;
  const a    = addr();
  const user = auth.currentUser;
  const path = servicePath(svc.id) || [svc];

  return addDoc(collection(db, 'bookings'), {
    orderId,
    status: 'pending',
    source: 'website',

    customerId:    user?.uid || null,
    isGuest:       !user,
    customerName:  name  || '',
    customerPhone: phone || '',
    customerEmail: email || '',

    serviceId:   svc.id,
    serviceName: svc.title,
    servicePath: path.map(n => n.title).join(' > '),
    enquiredVia: (_entryTitle && _entryTitle !== path[0]?.title) ? _entryTitle : null,

    pricingType: svc.isFixed ? 'fixed' : 'quote',
    priceUnit:   svc.priceUnit || null,
    quantity:    hasQuantity(svc) ? _quantity : 1,
    amount:      svc.isFixed ? getTotal() : 0,
    mrp:         svc.mrp || null,

    address:      composeAddress(),
    addressParts: { ...a },
    geo:          (a.lat != null && a.lng != null) ? { lat: a.lat, lng: a.lng } : null,
    mapsLink:     mapsLink() || null,

    notes: window._bookingNotes || '',

    createdAt: serverTimestamp(),
  });
}

/** Renders a bullet list, trimming very long lists to keep the URL sane. */
function bulletList(items, max = 12) {
  const shown = items.slice(0, max).map(i => `• ${i}`);
  if (items.length > max) shown.push(`• …and ${items.length - max} more`);
  return shown;
}

// ─── Build WhatsApp message ───────────────────────────────────────────────────
function buildWhatsAppMessage(guestName, guestPhone, guestEmail, orderId) {
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
  if (svc.notes?.length) {
    L.push('*PLEASE NOTE*');
    L.push(...bulletList(svc.notes, 6));
    L.push('');
  }
  if (svc.customerProvides?.length) {
    L.push('*CUSTOMER TO ARRANGE*');
    L.push(...bulletList(svc.customerProvides, 6));
    L.push('');
  }

  // ── Address, plus a tappable Maps link so the crew can navigate
  L.push('*SERVICE ADDRESS*');
  const composed = composeAddress().trim();
  if (composed) composed.split(/\r?\n/).forEach(l => l.trim() && L.push(l.trim()));
  else L.push('(not provided)');

  const a = addr();
  if (a.lat != null && a.lng != null) {
    L.push(`GPS: ${a.lat}, ${a.lng} _(shared by customer)_`);
  }
  const link = mapsLink();
  if (link) {
    L.push('');
    L.push('*NAVIGATE*');
    L.push(link);
  }
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
  L.push(`*Order ID: ${orderId || makeOrderId()}*`);
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
  // Address is customer-specific, so keep it between bookings in the same
  // session (saves re-typing six fields). Notes are service-specific, so clear.
  window._bookingAddress = composeAddress();
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
  const addons     = svc.addons     || [];   // cost extra
  const notes      = svc.notes      || [];   // scope / info only
  const provides   = svc.customerProvides || [];

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
      <div class="covered-title" style="margin-top:12px;"><i class="fa-solid fa-plus-circle" style="color:var(--orange-500);"></i> Available on request — charged extra</div>
      <ul class="addons-list">
        ${addons.map(a => `<li><i class="fa-solid fa-plus"></i> ${a}</li>`).join('')}
      </ul>` : ''}
      ${notes.length ? `
      <div class="covered-title" style="margin-top:12px;"><i class="fa-solid fa-circle-info" style="color:var(--blue-500);"></i> Please note</div>
      <ul class="addons-list">
        ${notes.map(n => `<li><i class="fa-solid fa-info-circle"></i> ${n}</li>`).join('')}
      </ul>` : ''}
    </div>` : ''}

    ${provides.length ? `
    <div class="provide-section">
      <div class="provide-title"><i class="fa-solid fa-hand-holding-droplet"></i> What we'll need from you</div>
      <ul class="provide-list">
        ${provides.map(p => `<li><i class="fa-solid fa-circle-dot"></i> ${p}</li>`).join('')}
      </ul>
      <small class="provide-note">Please keep these ready so our team can start on time.</small>
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
  const a = addr();
  const embed = mapsEmbed(a);
  const link  = mapsLink(a);
  const esc = s => String(s || '').replace(/"/g, '&quot;');

  return `
    <div class="step-section">
      <label class="step-label">Service Address</label>

      <button type="button" class="locate-btn" id="useMyLocation">
        <i class="fa-solid fa-location-crosshairs"></i>
        <span>Use my current location</span>
      </button>
      <p class="locate-status" id="locateStatus">
        ${a.lat != null
          ? `<i class="fa-solid fa-circle-check"></i> Location pinned — the crew will get exact directions`
          : ''}
      </p>

      <div class="addr-grid">
        <div class="addr-field">
          <label for="addrFlat">Flat / House No. <span class="req">*</span></label>
          <input class="field-input" id="addrFlat" data-addr="flat" value="${esc(a.flat)}"
                 placeholder="e.g. 402" autocomplete="address-line1" />
        </div>
        <div class="addr-field">
          <label for="addrBuilding">Building / Society</label>
          <input class="field-input" id="addrBuilding" data-addr="building" value="${esc(a.building)}"
                 placeholder="e.g. Aparna Sarovar" autocomplete="address-line2" />
        </div>
        <div class="addr-field addr-wide">
          <label for="addrStreet">Street / Locality / Area <span class="req">*</span></label>
          <input class="field-input" id="addrStreet" data-addr="street" value="${esc(a.street)}"
                 placeholder="e.g. Nallagandla, Serilingampally" autocomplete="address-level3" />
        </div>
        <div class="addr-field addr-wide">
          <label for="addrLandmark">Nearby Landmark</label>
          <input class="field-input" id="addrLandmark" data-addr="landmark" value="${esc(a.landmark)}"
                 placeholder="e.g. opposite Reliance Fresh" />
        </div>
        <div class="addr-field">
          <label for="addrCity">City <span class="req">*</span></label>
          <input class="field-input" id="addrCity" data-addr="city" value="${esc(a.city)}"
                 placeholder="Hyderabad" autocomplete="address-level2" />
        </div>
        <div class="addr-field">
          <label for="addrPincode">Pincode <span class="req">*</span></label>
          <input class="field-input" id="addrPincode" data-addr="pincode" value="${esc(a.pincode)}"
                 placeholder="500019" inputmode="numeric" maxlength="6" autocomplete="postal-code" />
        </div>
      </div>

      <div class="map-preview ${embed ? '' : 'is-empty'}" id="mapPreview">
        ${embed
          ? `<iframe title="Service location preview" src="${embed}" loading="lazy"
                     referrerpolicy="no-referrer-when-downgrade"></iframe>
             <a class="map-verify" href="${link}" target="_blank" rel="noopener">
               <i class="fa-solid fa-map-location-dot"></i> Verify on Google Maps
             </a>`
          : `<div class="map-empty">
               <i class="fa-solid fa-map-location-dot"></i>
               <span>Fill the address or share your location to preview it on the map</span>
             </div>`}
      </div>
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

// ─── Booking confirmation ─────────────────────────────────────────────────────

/** Replaces the modal body with a confirmation so the user isn't left stuck. */
function showBookingConfirmed(orderId, { saved, isGuest }) {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;
  const title    = modal.querySelector('.booking-title');
  const progress = modal.querySelector('.booking-progress');
  const body     = modal.querySelector('.booking-body');
  if (title) title.textContent = 'Booking Received';
  if (progress) progress.innerHTML = '';

  body.innerHTML = `
    <div class="booked-wrap">
      <div class="booked-tick"><i class="fa-solid fa-check"></i></div>
      <h3 class="booked-title">Thank you! We've got your booking.</h3>
      <p class="booked-sub">Our team will call you shortly to confirm the details.</p>

      <div class="booked-order">
        <small>Your Order ID</small>
        <div class="booked-order-row">
          <strong id="bookedOrderId">${orderId}</strong>
          <button class="booked-copy" id="copyOrderId" title="Copy order ID">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
        <span class="booked-status"><i class="fa-solid fa-clock"></i> Status: Pending confirmation</span>
      </div>

      ${saved === false ? `
        <div class="booked-warn">
          <i class="fa-solid fa-triangle-exclamation"></i>
          We couldn't save this to your profile just now, but your WhatsApp
          message has reached our team and we'll follow up.
        </div>` : ''}

      ${isGuest ? `
        <div class="booked-note">
          <i class="fa-solid fa-circle-info"></i>
          Create an account with this mobile number to track all your orders in one place.
        </div>` : ''}

      <div class="booked-actions">
        ${!isGuest && saved !== false
          ? `<a class="btn btn-primary w-100" href="pages/account.html#orders">
               <i class="fa-solid fa-truck-fast"></i> Track my order
             </a>`
          : ''}
        <button class="btn btn-outline w-100" id="bookedClose">Done</button>
      </div>
    </div>
  `;

  body.querySelector('#copyOrderId')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      showToast('Order ID copied');
    } catch { showToast('Could not copy — please note it down'); }
  });

  body.querySelector('#bookedClose')?.addEventListener('click', () => {
    modal.classList.remove('modal-open');
    document.body.style.overflow = '';
  });
}

/**
 * Single submit path for both WhatsApp and Call.
 * Order of operations matters: the order id and message are built
 * synchronously so `window.open` stays inside the user gesture (otherwise
 * popup blockers kill it), and the Firestore write happens after.
 */
function submitBooking({ name, phone, email, channel }) {
  const orderId = makeOrderId();
  const isGuest = !auth.currentUser;

  if (channel === 'whatsapp') {
    const msg = buildWhatsAppMessage(name, phone, email, orderId);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  }

  // Show confirmation immediately; correct it if the write fails.
  showBookingConfirmed(orderId, { saved: true, isGuest });

  saveBooking({ orderId, name, phone, email }).catch(err => {
    console.error('[booking] save failed', err);
    showBookingConfirmed(orderId, { saved: false, isGuest });
  });
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
      <div class="confirm-row"><span>Address</span><strong>${addressOneLine() || '-'}</strong></div>
      ${addr().lat != null
        ? `<div class="confirm-row"><span>Location</span><strong class="geo-ok"><i class="fa-solid fa-location-dot"></i> GPS pinned</strong></div>`
        : ''}
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

  // Logged-in customer details, if available
  const currentUserDetails = () => {
    const user = auth.currentUser;
    if (!user) return null;
    return {
      name:  window._userProfile?.name  || user.displayName || '',
      phone: window._userProfile?.phone || user.phoneNumber  || '',
      email: window._userProfile?.email || user.email        || '',
    };
  };

  // WhatsApp button — if already logged in send directly, else show options
  body.querySelector('#ctaWhatsapp')?.addEventListener('click', () => {
    const me = currentUserDetails();
    if (me) {
      submitBooking({ ...me, channel: 'whatsapp' });
      return;
    }
    const waOptions = body.querySelector('#waOptions');
    waOptions.style.display = waOptions.style.display === 'none' ? 'block' : 'none';
  });

  // Call Us — still register the enquiry so phone bookings are tracked too
  body.querySelector('#ctaCall')?.addEventListener('click', () => {
    const me = currentUserDetails();
    if (!me) return;                       // guests: nothing to attribute it to
    submitBooking({ ...me, channel: 'call' });
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
    submitBooking({ name, phone, email: '', channel: 'whatsapp' });
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

  // Refreshes the embedded map without re-rendering the whole step
  // (re-rendering would steal focus from the field being typed in).
  let mapTimer = null;
  function refreshMapPreview() {
    clearTimeout(mapTimer);
    mapTimer = setTimeout(() => {
      const host = document.getElementById('mapPreview');
      if (!host) return;
      const embed = mapsEmbed();
      const link  = mapsLink();
      if (!embed) {
        host.classList.add('is-empty');
        host.innerHTML = `<div class="map-empty"><i class="fa-solid fa-map-location-dot"></i>
          <span>Fill the address or share your location to preview it on the map</span></div>`;
        return;
      }
      host.classList.remove('is-empty');
      const frame = host.querySelector('iframe');
      if (frame) {
        if (frame.getAttribute('src') !== embed) frame.setAttribute('src', embed);
        host.querySelector('.map-verify')?.setAttribute('href', link);
      } else {
        host.innerHTML = `<iframe title="Service location preview" src="${embed}" loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
          <a class="map-verify" href="${link}" target="_blank" rel="noopener">
            <i class="fa-solid fa-map-location-dot"></i> Verify on Google Maps</a>`;
      }
    }, 700); // debounce so we don't reload the iframe on every keystroke
  }

  // Address / notes live capture
  modal.addEventListener('input', (e) => {
    const key = e.target.dataset?.addr;
    if (key && ADDRESS_FIELDS.includes(key)) {
      let v = e.target.value;
      if (key === 'pincode') {
        v = v.replace(/\D/g, '').slice(0, 6);
        if (e.target.value !== v) e.target.value = v;
      }
      addr()[key] = v;
      // Typing a new address invalidates a previously pinned GPS point
      if (key !== 'landmark' && addr().lat != null) {
        addr().lat = null; addr().lng = null;
        const st = document.getElementById('locateStatus');
        if (st) st.innerHTML = '';
      }
      window._bookingAddress = composeAddress();
      refreshMapPreview();
    }
    if (e.target.id === 'bookingNotes') window._bookingNotes = e.target.value;
  });

  // "Use my current location" — browser Geolocation, no API key needed
  modal.addEventListener('click', (e) => {
    if (!e.target.closest('#useMyLocation')) return;
    const btn = modal.querySelector('#useMyLocation');
    const st  = modal.querySelector('#locateStatus');
    if (!navigator.geolocation) {
      if (st) st.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Your browser doesn't support location sharing`;
      return;
    }
    btn.classList.add('is-loading');
    if (st) st.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Getting your location…`;
    navigator.geolocation.getCurrentPosition(
      pos => {
        btn.classList.remove('is-loading');
        addr().lat = +pos.coords.latitude.toFixed(6);
        addr().lng = +pos.coords.longitude.toFixed(6);
        if (st) st.innerHTML = `<i class="fa-solid fa-circle-check"></i> Location pinned — the crew will get exact directions`;
        refreshMapPreview();
      },
      err => {
        btn.classList.remove('is-loading');
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — please type the address instead'
          : 'Could not get your location — please type the address instead';
        if (st) st.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  // Delegated navigation for address step buttons
  modal.addEventListener('click', (e) => {
    if (e.target.closest('#backToDetails')) {
      window._bookingAddress = composeAddress();
      window._bookingNotes   = document.getElementById('bookingNotes')?.value || '';
      _step = 1;
      renderBookingStep();
    }
    if (e.target.closest('#toSummaryStep')) {
      window._bookingNotes = document.getElementById('bookingNotes')?.value || '';
      const a = addr();
      if (!a.flat.trim())              { showToast('Please enter your flat / house number'); return; }
      if (!a.street.trim())            { showToast('Please enter your street / locality');   return; }
      if (!a.city.trim())              { showToast('Please enter your city');                return; }
      if (!/^\d{6}$/.test(a.pincode))  { showToast('Please enter a valid 6-digit pincode');   return; }
      window._bookingAddress = composeAddress();
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
