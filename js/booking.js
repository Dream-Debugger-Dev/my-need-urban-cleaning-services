/* ===============================
   MyNeedUrban — booking.js
   Booking wizard: no login gate, WhatsApp / Call CTA at end
   =============================== */

// Every import carries the same ?v= as the HTML. A module imported under two
// different URLs runs twice — that is how auth.js ended up with doubled login
// handlers (two OTP SMS per tap). Keep all ?v= values identical on deploy.
import { auth, db, collection, addDoc, serverTimestamp } from './firebase-config.js?v=20260924b';
import { showToast } from './auth.js?v=20260924b';
import { makeOrderId } from './order-id.js?v=20260924b';

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
  "If your home's size isn't listed, choose \"Other\" — we'll visit the site and confirm the price.",
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
      interiorTier('interior-other', 'Other / Larger Home', 'Site visit, then final price', null, {
        requirementHint: 'Tell us your BHK and approximate built-up area (sq ft), and we\'ll arrange a site visit.',
      }),
    ],
  },
  {
    id: 'deep', title: 'Home Deep Cleaning', icon: 'fa-broom',
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
    subtitle: 'Carpet, floor, sofa, pantry & full office packages · from ₹799',
    children: [
      {
        id: 'office-carpet', title: 'Carpet Shampooing', icon: 'fa-rug',
        subtitle: 'Per sq ft · ₹4–₹8 · min 500 sq ft',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total carpet area in sq ft? Number of rooms / floors?',
        covered: [
          'Dry vacuuming to remove dust, dirt and debris from carpet fibres',
          'Wet shampooing — foam-based deep clean with professional equipment',
          'Wet vacuuming & rinsing to extract residual moisture and foam',
          'Surface drying — carpet dries under a fan in 3–4 hours',
        ],
        notCovered: [
          'Removal of paint, ink or permanent stains',
          'Carpet lifting, re-fitting or repairs',
          'Industrial or outdoor carpets',
        ],
        notes: [
          'Pricing: ₹4–₹8 per sq ft depending on carpet condition and type.',
          'Minimum chargeable area: 500 sq ft.',
          'Please ensure the area is cleared of furniture before the team arrives.',
          'Water supply and a power point must be available on site.',
        ],
      },
      {
        id: 'office-chair', title: 'Office Chair Shampooing', icon: 'fa-chair',
        subtitle: 'Per chair · ₹79–₹129 · min 12 chairs',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total number of chairs? Chair type (mesh, fabric, leather)?',
        covered: [
          'Dry vacuuming — removes dust and debris from fabric surfaces',
          'Wet shampooing — lifts stains using foam-based shampooing with professional tools',
          'Wet vacuuming & rinsing — extracts residual moisture and foam',
          'Surface drying — chairs dry in 2–3 hours',
        ],
        notCovered: [
          'Removal of paint, ink or permanent stains',
          'Leather chairs (priced separately)',
          'Chair repairs or reupholstery',
        ],
        notes: [
          'Pricing: ₹79–₹129 per chair depending on chair type and condition.',
          'Minimum order: 12 chairs.',
          'Water supply and a power point must be available on site.',
        ],
      },
      {
        id: 'office-floor', title: 'Floor Cleaning with Scrubbing Machine', icon: 'fa-shoe-prints',
        subtitle: 'Per sq ft · ₹3–₹6 · min 500 sq ft',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total floor area in sq ft? Floor type (tile, marble, vinyl)?',
        covered: [
          'Machine scrubbing of all floor surfaces',
          'Removal of dirt, stains and grime build-up',
          'Mopping and drying after scrubbing',
          'Suitable for tile, marble, granite and vinyl flooring',
        ],
        notCovered: [
          'Floor polishing or buffing (available on request)',
          'Carpet areas (see Carpet Shampooing)',
          'Exterior or terrace floors',
        ],
        notes: [
          'Pricing: ₹3–₹6 per sq ft depending on floor condition and type.',
          'Minimum chargeable area: 500 sq ft.',
          'Power point and water supply must be available on site.',
        ],
      },
      {
        id: 'office-sofa', title: 'Sofa Shampooing', icon: 'fa-couch',
        subtitle: 'Per seat · ₹119–₹159 · min 6 seats',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total number of seats? Sofa type (fabric, leather, sectional)?',
        covered: [
          'Dry vacuuming — removes dust and debris from all surfaces, corners and crevices',
          'Wet shampooing — lifts stains using foam-based shampooing with professional tools',
          'Wet vacuuming & rinsing — extracts residual moisture and foam',
          'Surface drying — sofa dries under a fan in 3–4 hours',
        ],
        notCovered: [
          'Removal of paint or ink stains',
          'Leather sofas (priced separately)',
          'Cushion or fabric repairs',
        ],
        notes: [
          'Pricing: ₹119–₹159 per seat depending on sofa condition and fabric type.',
          'Minimum order: 6 seats.',
          'Water supply and a power point must be available on site.',
        ],
      },
      {
        id: 'office-pantry', title: 'Pantry Deep Cleaning', icon: 'fa-sink',
        subtitle: 'Starting from ₹799',
        isLeaf: true, isFixed: true, price: 799, priceUnit: 'per visit',
        covered: [
          'Cleaning of countertops, sink and taps',
          'Cabinet interior and exterior scrubbing',
          'Appliance exterior cleaning (microwave, kettle, toaster)',
          'Floor scrubbing and mopping',
          'Waste bin cleaning and sanitising',
          'Wall tiles and backsplash cleaning',
        ],
        notCovered: [
          'Industrial kitchen equipment cleaning',
          'Gas pipeline or electrical work',
          'Full kitchen deep clean (priced separately)',
        ],
        notes: [
          'Final price depends on pantry size and condition.',
          'Starting price: ₹799 for a standard office pantry.',
        ],
      },
      {
        id: 'office-complete', title: 'Complete Office Cleaning', icon: 'fa-building',
        subtitle: 'Full office deep clean · sq ft basis · after site visit',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total office area (sq ft), number of floors, workstations and any specific requirements?',
        covered: [
          'Complete floor deep cleaning with scrubbing machine',
          'Workstation, desk and cabin dusting and wiping',
          'Glass partitions, windows and doors cleaning',
          'Reception, lobby and common area cleaning',
          'Washroom deep cleaning and sanitising',
          'Pantry / kitchen cleaning',
          'Waste disposal and bin sanitising',
          'AC vents, switchboards and fixtures dusting',
        ],
        notCovered: [
          'Carpet shampooing (available as add-on)',
          'Chair or sofa shampooing (available as add-on)',
          'Exterior facade or terrace cleaning',
          'Pest control or fumigation',
        ],
        notes: [
          'Pricing is on a sq ft basis and will be confirmed after a site visit.',
          'Please ensure all areas are accessible before the team arrives.',
          'One staff member should be available on site throughout.',
        ],
      },
      {
        id: 'office-new', title: 'Newly Completed Office Cleaning', icon: 'fa-hammer',
        subtitle: 'Post-construction / handover deep clean · sq ft basis · after site visit',
        isLeaf: true, isFixed: false,
        requirementHint: 'Total office area (sq ft), number of floors, and current condition of the space?',
        covered: [
          'Construction dust, debris and site residue removal',
          'Sticker and adhesive residue removal from glass and surfaces',
          'Paint mark and blue marking removal',
          'Floor deep cleaning with scrubbing machine',
          'Workstation, cabin, glass partition and window cleaning',
          'Washroom deep cleaning and sanitising',
          'Waste disposal and site clean-up',
        ],
        notCovered: [
          'Removal of construction debris or leftover materials (heavy waste)',
          'Exterior facade or terrace cleaning',
          'Pest control or fumigation',
          'Electrical or plumbing work',
        ],
        notes: [
          'Pricing is on a sq ft basis and will be confirmed after a site visit.',
          'One staff member must be present on the premises throughout.',
          'Please ensure power and water supply are available before the team arrives.',
        ],
      },
    ],
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
  {
    id: 'commercial', title: 'Other Commercial Cleaning', icon: 'fa-store',
    subtitle: 'Salon, hostel, bank, shop, restaurant, school & more · pricing after site visit',
    isLeaf: true,
    isFixed: false,
    isCommercial: true,     // flag used by renderDetailsStep
    requirementHint: 'Describe your space, approximate area (sq ft), number of rooms/floors, and any special requirements.',
    covered: [
      'Full interior cleaning of all rooms and common areas',
      'Floor scrubbing and mopping',
      'Dusting of furniture, fixtures, shelves and fittings',
      'Ceiling fan, AC vent and switchboard cleaning',
      'Restroom / washroom deep cleaning and sanitising',
      'Glass, mirror and partition cleaning',
      'Waste disposal and bin cleaning',
    ],
    notCovered: [
      'Cleaning of exterior facade or roof',
      'Medical equipment or specialised lab equipment cleaning',
      'Pest control or fumigation',
      'Heavy machinery or industrial equipment cleaning',
    ],
    notes: [
      'Pricing will be finalised after our team visits your premises.',
      'Please ensure access to all areas that need cleaning before the visit.',
      'One staff member should be available on site during the cleaning.',
    ],
  },
];

// ─── Service card aliases ─────────────────────────────────────────────────────
// Some homepage cards are marketing entry points rather than their own catalog.
// They open an existing catalog straight away but keep their own heading, so a
// visitor who clicked "Bungalow Cleaning" doesn't suddenly see "Deep Cleaning".
// NOTE: 'bungalow' used to alias to the apartment deep-clean catalog. It now
// has its own area-based catalog, so the alias was removed.
// The homepage card and the catalog now share the title "Home Deep Cleaning",
// so saveBooking() records enquiredVia = null for this entry (it only records
// an alias when its title differs from the catalog's).
const SERVICE_ALIASES = {
  home: { target: 'deep', title: 'Home Deep Cleaning' },
};

// ─── Service search ───────────────────────────────────────────────────────────
// Words customers actually type, attached to the TOP-LEVEL node only. Putting
// them on every descendant made "chimney" return all eight kitchen packages;
// leaves are matched on their own title, subtitle and path instead.
const SEARCH_SYNONYMS = {
  'interior-done': ['new house', 'new flat', 'handover', 'post construction', 'after interior', 'paint marks', 'sticker', 'move in'],
  deep:       ['home', 'house', 'flat', 'apartment', 'full home', 'full house', 'bhk', 'move in', 'shifting', 'vacate'],
  bungalow:   ['villa', 'independent house', 'duplex', 'big house'],
  bathroom:   ['toilet', 'washroom', 'restroom', 'bath'],
  kitchen:    ['chimney', 'fridge', 'refrigerator', 'microwave', 'oven', 'stove', 'hob', 'cabinet', 'appliance'],
  sofa:       ['couch', 'seater', 'seats', 'upholstery', 'settee'],
  carpet:     ['rug'],
  mattress:   ['bed'],
  office:     ['workplace', 'corporate', 'pantry', 'chair', 'workstation', 'cabin', 'desk'],
  floor:      ['tiles', 'tile', 'marble', 'granite', 'scrubbing'],
  commercial: ['salon', 'spa', 'hostel', 'pg', 'clinic', 'pharmacy', 'bank', 'shop', 'showroom', 'store', 'restaurant', 'dining', 'school', 'cafe', 'gym'],
};

const normText = s => String(s || '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

let _searchIndex = null;

/** Flattens the catalog once into searchable entries. */
function buildSearchIndex() {
  const out = [];
  const walk = (nodes, trail) => {
    for (const n of nodes) {
      const path = [...trail, n];
      const syn = trail.length === 0 ? (SEARCH_SYNONYMS[n.id] || []).join(' ') : '';
      const hay = normText([n.title, n.subtitle, ...path.map(p => p.title), syn].join(' '));
      // Squashed copy so "2bhk" still matches "2 BHK"
      out.push({ node: n, path, title: normText(n.title), hay: `${hay} ${hay.replace(/ /g, '')}` });
      if (n.children) walk(n.children, path);
    }
  };
  walk(SERVICE_CATALOG, []);
  return out;
}

/** Ranked matches for a free-text query. Every word must match (AND). */
function searchCatalog(query, max = 12) {
  const tokens = normText(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  _searchIndex = _searchIndex || buildSearchIndex();
  const joined = tokens.join(' ');
  // Numbers must match whole: "2" in "2 bhk" must not hit "up to 2400 sq ft".
  const hit = (hay, t) => /^\d+$/.test(t)
    ? new RegExp(`(^|\\s)${t}(\\s|$)`).test(hay)
    : hay.includes(t);
  const scored = [];
  for (const e of _searchIndex) {
    if (!tokens.every(t => hit(e.hay, t))) continue;
    let score = 0;
    if (e.title === joined) score += 100;
    if (e.title.startsWith(tokens[0])) score += 40;
    for (const t of tokens) if (e.title.includes(t)) score += 15;
    if (e.path.length === 1) score += 8;   // whole categories first for vague queries
    if (e.node.isLeaf) score += 5;
    scored.push({ ...e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return scored.slice(0, max);
}

// ─── Starting prices ──────────────────────────────────────────────────────────
/** Cheapest fixed price anywhere under a node, or null if it is quote-only. */
function minFixedPrice(node) {
  if (!node) return null;
  if (node.isLeaf) return node.isFixed && node.price ? { price: node.price, unit: node.priceUnit } : null;
  let best = null;
  for (const c of node.children || []) {
    const p = minFixedPrice(c);
    if (p && (!best || p.price < best.price)) best = p;
  }
  return best;
}

/** " / bathroom" for per-unit prices, "" for per-visit ones. */
const unitSuffix = unit => (unit && unit !== 'per visit') ? ` / ${unit.replace(/^per /, '')}` : '';

/** Plain-text starting price, e.g. "From ₹3,899" or "Site visit". */
function fromLabel(node) {
  const p = minFixedPrice(node);
  return p ? `From ₹${inr(p.price)}${unitSuffix(p.unit)}` : 'Site visit · custom price';
}

/** Parent node of `id`: null for top-level, undefined if not found. */
function parentOf(id, nodes = SERVICE_CATALOG, parent = null) {
  for (const n of nodes) {
    if (n.id === id) return parent;
    if (n.children) {
      const p = parentOf(id, n.children, n);
      if (p !== undefined) return p;
    }
  }
  return undefined;
}

/** Escapes text for safe insertion into HTML. */
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── State ────────────────────────────────────────────────────────────────────
let _selectedService = null;
let _step = 0; // 0=catalog, 1=details, 2=address, 3=summary+CTA
let _quantity = 1;
let _currentCatalog = null;
let _entryTitle = null;      // heading to show for the aliased entry level
let _entryCatalogId = null;  // catalog id the heading applies to
let _selectedVenueType = ''; // for commercial cleaning — which venue type was chosen
let _customVenueName = '';   // free-text when "Other" is picked
let _searchQuery = '';       // root-level service search; kept while browsing
let _lastViewKey = '';       // resets scroll only when the view actually changes

/**
 * Venue types for Other Commercial Cleaning.
 * Single source of truth — the tile picker and the WhatsApp label both read
 * this, so they can't drift apart. `ask` tailors the description prompt.
 */
const VENUE_TYPES = [
  { id: 'salon',      icon: 'fa-scissors',         label: 'Salon / Spa' },
  { id: 'hostel',     icon: 'fa-bed',              label: 'Hostel / PG' },
  { id: 'clinic',     icon: 'fa-stethoscope',      label: 'Clinic / Pharmacy' },
  { id: 'bank',       icon: 'fa-building-columns', label: 'Banking Branch' },
  { id: 'shop',       icon: 'fa-shop',             label: 'Small Shop / Showroom' },
  { id: 'restaurant', icon: 'fa-utensils',         label: 'Restaurant / Dining Hall' },
  { id: 'chairs',     icon: 'fa-chair',            label: 'Restaurant Chairs',
    ask: 'How many chairs need cleaning, and what material are they (fabric, leather, plastic)?' },
  { id: 'school',     icon: 'fa-school',           label: 'Small School' },
  { id: 'other',      icon: 'fa-ellipsis',         label: 'Other' },
];

const DEFAULT_VENUE_ASK =
  'Approximate area (sq ft), number of rooms / floors, current condition, and anything else our team should know.';

/** Display label for a venue id, falling back to the customer's own wording. */
const venueLabel = (id) => id === 'other'
  ? (_customVenueName || 'Other')
  : (VENUE_TYPES.find(v => v.id === id)?.label || id);

/** Description prompt for a venue id. */
const venueAsk = (id) =>
  VENUE_TYPES.find(v => v.id === id)?.ask || DEFAULT_VENUE_ASK;

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

// ─── Schedule & contact helpers ───────────────────────────────────────────────

const CONTACT_FIELDS = ['name', 'email', 'phone', 'altPhone'];

function emptyContact() {
  return { date: '', name: '', email: '', phone: '', altPhone: '' };
}

/** Live schedule + contact record, created on first use. */
function contact() {
  if (!window._bookingContact) window._bookingContact = emptyContact();
  return window._bookingContact;
}

/** Prefills name/email/phone from the signed-in profile, without overwriting typing. */
function prefillContactFromProfile() {
  const user = auth.currentUser;
  if (!user) return;
  const c = contact();
  const p = window._userProfile || {};
  if (!c.name)  c.name  = p.name  || user.displayName || '';
  if (!c.email) c.email = p.email || user.email       || '';
  if (!c.phone) {
    const raw = p.phone || user.phoneNumber || '';
    c.phone = String(raw).replace(/\D/g, '').slice(-10);
  }
  // Saved from the My Bookings profile editor
  if (!c.altPhone && p.altPhone) c.altPhone = String(p.altPhone).replace(/\D/g, '').slice(-10);
}

const yyyymmdd = d => d.toISOString().slice(0, 10);

/** Friendly date for summaries and messages. */
function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
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

// Order ids (MNU-YYMMDD-XXXXX) come from ./order-id.js, shared with form.js.

/**
 * Persists the enquiry so it shows up in the customer's profile and the
 * admin dashboard. Returns the Firestore doc id.
 *
 * Note: the order id is generated by the caller *before* this runs, so the
 * WhatsApp window can be opened synchronously inside the click handler
 * (opening it after an await gets blocked by popup blockers).
 */
async function saveBooking({ orderId, channel }) {
  const svc  = _selectedService;
  const a    = addr();
  const c    = contact();
  const user = auth.currentUser;
  const path = servicePath(svc.id) || [svc];
  const { name, phone, email } = c;

  return addDoc(collection(db, 'bookings'), {
    orderId,
    status: 'pending',
    source: 'website',
    channel: channel || 'unknown',   // 'whatsapp' | 'call' — how the customer chose to confirm

    customerId:    user?.uid || null,
    isGuest:       !user,
    customerName:     name  || '',
    customerPhone:    phone || '',
    customerAltPhone: c.altPhone || '',
    customerEmail:    email || '',

    scheduledDate: c.date || null,

    serviceId:   svc.id,
    serviceName: svc.title,
    servicePath: path.map(n => n.title).join(' > '),
    enquiredVia: (_entryTitle && _entryTitle !== path[0]?.title) ? _entryTitle : null,
    venueType:   svc.isCommercial ? (_selectedVenueType === 'other' ? _customVenueName || 'Other' : _selectedVenueType) : null,

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
function buildWhatsAppMessage(orderId) {
  const c = contact();
  const guestName  = c.name;
  const guestPhone = c.phone;
  const guestEmail = c.email;
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
  // For commercial cleaning — show the venue type prominently
  if (svc.isCommercial && _selectedVenueType) {
    L.push(`*Venue type:* ${venueLabel(_selectedVenueType)}`);
  }
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
    L.push('Custom price — to be confirmed');
    L.push('_Our team will review the details and confirm the price._');
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

  // ── Preferred service date
  if (c.date) {
    L.push('*PREFERRED DATE*');
    L.push(prettyDate(c.date));
    L.push('');
  }

  // ── Contact
  L.push('*CONTACT DETAILS*');
  L.push(`Name: ${guestName || '(not provided)'}`);
  L.push(`Phone: ${guestPhone ? (guestPhone.startsWith('+') ? guestPhone : '+91 ' + guestPhone) : '(not provided)'}`);
  if (c.altPhone) L.push(`Alt Phone: +91 ${c.altPhone}`);
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
/**
 * Opens the booking sheet.
 *   openBooking()            → every category, with search
 *   openBooking('kitchen')   → that category's packages
 *   openBooking('sofa-5-seats') → straight to that package's details
 * opts.focusSearch focuses the search box (used by the "Search" buttons).
 */
export function openBooking(serviceId, opts = {}) {
  _step = 0;
  _selectedService = null;
  _quantity = 1;
  _currentCatalog = null;
  _entryTitle = null;
  _entryCatalogId = null;
  _selectedVenueType = '';
  _customVenueName = '';
  _searchQuery = opts.query || '';
  _lastViewKey = '';
  // Address is customer-specific, so keep it between bookings in the same
  // session (saves re-typing six fields). Notes are service-specific, so clear.
  window._bookingAddress = composeAddress();
  window._bookingNotes = '';

  if (serviceId) {
    // Resolve marketing aliases (e.g. "home" → the deep-clean catalog)
    const alias = SERVICE_ALIASES[serviceId];
    const lookupId = alias ? alias.target : serviceId;

    const found = findService(lookupId, SERVICE_CATALOG);
    if (found) {
      if (found.isLeaf) {
        _selectedService = found;
        _step = 1;
        // Remember the list it came from, so "Back" shows its siblings
        // instead of dumping the customer at the very top.
        _currentCatalog = parentOf(found.id) || null;
      } else {
        _currentCatalog = found;
        if (alias) { _entryTitle = alias.title; _entryCatalogId = found.id; }
      }
    }
  }
  document.getElementById('bookingModal')?.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  renderBookingStep();

  if (opts.focusSearch && _step === 0 && !_currentCatalog) {
    // Wait for the sheet's slide-in so mobile browsers accept the focus
    setTimeout(() => document.getElementById('svcSearch')?.focus(), 80);
  }
}

/** Closes the booking sheet and restores page scrolling. */
function closeBooking() {
  document.getElementById('bookingModal')?.classList.remove('modal-open');
  document.body.style.overflow = '';
}

/** Navigates to any catalog node — used by search results and root tiles. */
function goToNode(id) {
  const node = findService(id, SERVICE_CATALOG);
  if (!node) return;
  if (node.isLeaf) {
    _selectedService = node;
    _currentCatalog = parentOf(node.id) || null;
    _quantity = 1;
    _step = 1;
  } else {
    _currentCatalog = node;
    _step = 0;
  }
  renderBookingStep();
}

// ─── Render dispatcher ────────────────────────────────────────────────────────
function renderBookingStep() {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;
  const body     = modal.querySelector('.booking-body');
  const progress = modal.querySelector('.booking-progress');
  const title    = modal.querySelector('.booking-title');

  if (_step === 0 && !_currentCatalog) {
    title.textContent = 'Book a Service';
    progress.innerHTML = renderProgress(0);
    body.innerHTML = renderRootHTML();
    attachRootEvents(body);
  } else if (_step === 0) {
    // Show the entry card's own name at the level it opened; deeper levels use
    // the real catalog title.
    title.textContent = _entryTitle && _currentCatalog.id === _entryCatalogId
      ? _entryTitle : _currentCatalog.title;
    progress.innerHTML = renderProgress(0);
    body.innerHTML = renderCatalogHTML(_currentCatalog.children);
    attachCatalogEvents(body);
  } else if (_step === 1) {
    title.textContent = _selectedService.isFixed ? 'Package Details' : 'Service Details';
    progress.innerHTML = renderProgress(1);
    body.innerHTML = renderDetailsStep();
    attachDetailsEvents(body);
  } else if (_step === 2) {
    title.textContent = 'Your Address';
    progress.innerHTML = renderProgress(2);
    body.innerHTML = renderAddressStep();
  } else if (_step === 3) {
    title.textContent = 'Schedule & Your Details';
    progress.innerHTML = renderProgress(3);
    body.innerHTML = renderScheduleStep();
  } else if (_step === 4) {
    title.textContent = 'Confirm Booking';
    progress.innerHTML = renderProgress(4);
    body.innerHTML = renderSummaryStep();
    attachSummaryEvents(body);
  }

  // New screen → start at the top. The quantity stepper re-renders the same
  // screen, so it keeps its scroll position.
  const key = `${_step}|${_currentCatalog?.id || ''}|${_selectedService?.id || ''}`;
  if (key !== _lastViewKey) {
    _lastViewKey = key;
    body.scrollTop = 0;
    const box = modal.querySelector('.mnu-modal-box');
    if (box) box.scrollTop = 0;
  }
}

function renderProgress(active) {
  const steps = ['Service', 'Details', 'Address', 'Schedule', 'Confirm'];
  return steps.map((s, i) => `
    <div class="bp-step ${i <= active ? 'active' : ''} ${i < active ? 'done' : ''}">
      <div class="bp-dot">${i < active ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
      <span>${s}</span>
    </div>
    ${i < steps.length - 1 ? `<div class="bp-line ${i < active ? 'active' : ''}"></div>` : ''}
  `).join('');
}

// ─── Step 0: Catalog ──────────────────────────────────────────────────────────
// Root level: search + every category as a tile. Rendered as <button>s so the
// whole sheet works with a keyboard and screen reader, not just a mouse.
function renderRootHTML() {
  const q = _searchQuery;
  const help = encodeURIComponent("Hi MyNeedUrban, I'm not sure which cleaning service I need. Can you help?");
  return `
    <div class="svc-search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input id="svcSearch" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
             placeholder="Search — sofa, chimney, 2 BHK, villa…" value="${escHtml(q)}"
             aria-label="Search services" aria-controls="svcResults" />
      <button type="button" class="svc-search-clear" id="svcSearchClear" aria-label="Clear search" ${q ? '' : 'hidden'}>
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="svc-results" id="svcResults" role="list" aria-live="polite" ${q ? '' : 'hidden'}>${q ? renderResultsHTML(q) : ''}</div>
    <div id="svcRoot" ${q ? 'hidden' : ''}>
      <p class="root-hint">Choose a category</p>
      <div class="root-grid">
        ${SERVICE_CATALOG.map(n => `
          <button type="button" class="root-tile" data-id="${n.id}">
            <span class="rt-icon"><i class="fa-solid ${n.icon}"></i></span>
            <span class="rt-title">${escHtml(n.title)}</span>
            <span class="rt-from ${minFixedPrice(n) ? '' : 'is-quote'}">${escHtml(fromLabel(n))}</span>
          </button>`).join('')}
      </div>
      <p class="root-help">
        <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
        Not sure what you need?
        <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${help}" target="_blank" rel="noopener">Ask us on WhatsApp</a>
      </p>
    </div>`;
}

function resultPriceLabel(n) {
  if (n.isLeaf) {
    return n.isFixed ? `₹${inr(n.price)}${unitSuffix(n.priceUnit)}` : 'Custom price';
  }
  return fromLabel(n);
}

function renderResultsHTML(q) {
  const hits = searchCatalog(q);
  if (!hits.length) {
    const ask = encodeURIComponent(`Hi MyNeedUrban, do you offer "${q}" cleaning?`);
    return `
      <div class="sr-empty">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <p>No service matches “${escHtml(q)}”.</p>
        <small>Try a simpler word like “sofa” or “kitchen”, or
          <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${ask}" target="_blank" rel="noopener">ask us on WhatsApp</a>.</small>
      </div>`;
  }
  return hits.map(h => {
    const crumb = h.path.length > 1
      ? h.path.slice(0, -1).map(p => p.title).join(' › ')
      : (h.node.subtitle || '');
    return `
      <button type="button" class="sr-item" role="listitem" data-id="${h.node.id}">
        <span class="sr-icon"><i class="fa-solid ${h.node.icon}"></i></span>
        <span class="sr-text">
          <strong>${escHtml(h.node.title)}</strong>
          ${crumb ? `<small>${escHtml(crumb)}</small>` : ''}
        </span>
        <span class="sr-price">${escHtml(resultPriceLabel(h.node))}</span>
      </button>`;
  }).join('');
}

function attachRootEvents(body) {
  const input   = body.querySelector('#svcSearch');
  const results = body.querySelector('#svcResults');
  const root    = body.querySelector('#svcRoot');
  const clear   = body.querySelector('#svcSearchClear');

  const refresh = () => {
    const q = _searchQuery.trim();
    results.hidden = !q;
    root.hidden = !!q;
    clear.hidden = !_searchQuery;
    results.innerHTML = q ? renderResultsHTML(q) : '';
  };

  let t = null;
  input?.addEventListener('input', () => {
    _searchQuery = input.value;
    clearTimeout(t);
    t = setTimeout(refresh, 90);   // update results without re-rendering the input
  });
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(t); refresh();
      results.querySelector('.sr-item')?.click();
    }
  });
  clear?.addEventListener('click', () => {
    _searchQuery = '';
    input.value = '';
    refresh();
    input.focus();
  });

  // Delegated, because results are replaced on every keystroke. .booking-body
  // outlives each render, so bind once or listeners stack up per visit.
  if (!body.dataset.rootDelegated) {
    body.dataset.rootDelegated = '1';
    body.addEventListener('click', e => {
      const hit = e.target.closest('.sr-item, .root-tile');
      if (hit && body.contains(hit)) goToNode(hit.dataset.id);
    });
  }
}

function renderCatalogHTML(items) {
  const parent = parentOf(_currentCatalog.id);
  const backLabel = parent ? parent.title : 'All services';
  return `
    <button type="button" class="cat-back" id="catBack">
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${escHtml(backLabel)}
    </button>
    <div class="catalog-list">${items.map(item => `
    <button type="button" class="catalog-item" data-id="${item.id}" data-leaf="${item.isLeaf || false}">
      <span class="ci-icon"><i class="fa-solid ${item.icon}"></i></span>
      <span class="ci-info">
        <strong>${escHtml(item.title)}</strong>
        ${item.subtitle ? `<small>${escHtml(item.subtitle)}</small>` : ''}
      </span>
      ${item.isLeaf && item.isFixed
        ? `<span class="ci-price-wrap">
            ${item.mrp ? `<span class="ci-mrp">₹${inr(item.mrp)}</span>` : ''}
            <span class="ci-price">₹${inr(item.price)}</span>
           </span>`
        : item.isLeaf
          ? `<span class="ci-quote">Custom price</span>`
          : `<span class="ci-group-from">${escHtml(fromLabel(item).replace(' · custom price', ''))}</span>
             <i class="fa-solid fa-chevron-right ci-arrow" aria-hidden="true"></i>`}
    </button>
  `).join('')}</div>`;
}

function attachCatalogEvents(body) {
  body.querySelector('#catBack')?.addEventListener('click', () => {
    _currentCatalog = parentOf(_currentCatalog.id) || null;
    _step = 0;
    renderBookingStep();
  });
  body.querySelectorAll('.catalog-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const isLeaf = el.dataset.leaf === 'true';
      const node = findService(id, SERVICE_CATALOG);
      if (!node) return;
      if (isLeaf) { _selectedService = node; _quantity = 1; _step = 1; }
      else { _currentCatalog = node; _step = 0; }
      renderBookingStep();
    });
  });
}

/** Writes each homepage card's "From ₹…" line from the catalog. */
function paintFromPrices() {
  document.querySelectorAll('[data-from-for]').forEach(el => {
    const id = el.dataset.fromFor;
    const alias = SERVICE_ALIASES[id];
    const node = findService(alias ? alias.target : id, SERVICE_CATALOG);
    if (!node) return;
    const p = minFixedPrice(node);
    el.innerHTML = p
      ? `From <strong>₹${inr(p.price)}</strong>${escHtml(unitSuffix(p.unit))}`
      : '<strong>Site visit</strong> · custom price';
    el.classList.toggle('is-quote', !p);
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
            ${svc.mrp ? `<s class="chip-mrp">₹${inr(svc.mrp)}</s>` : ''}
            <strong>₹${inr(svc.price)}${unitSuffix(svc.priceUnit)}</strong>
           </div>`
        : '<strong>Custom price</strong>'}
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

    ${svc.isCommercial ? `
    <!-- ── Venue type picker ── -->
    <div class="venue-picker step-section">
      <label class="step-label">Select your venue type <span class="req">*</span></label>
      <div class="venue-grid" id="venueGrid">
        ${VENUE_TYPES.map(v => `
          <button class="venue-tile ${_selectedVenueType === v.id ? 'selected' : ''}"
                  data-venue="${v.id}" type="button">
            <i class="fa-solid ${v.icon}"></i>
            <span>${v.label}</span>
          </button>`).join('')}
      </div>
      <p class="venue-error" id="venueError"></p>

      <!-- Custom name input — shown only when "Other" is selected -->
      <div id="venueOtherWrap" style="display:${_selectedVenueType === 'other' ? 'block' : 'none'}; margin-top:12px;">
        <label class="step-label" for="venueOtherInput">Describe your venue <span class="req">*</span></label>
        <input class="field-input" id="venueOtherInput" type="text"
               placeholder="e.g. Co-working space, gym, daycare centre…"
               value="${_customVenueName}" maxlength="80" />
      </div>

      <!-- Space description — always visible once a venue is picked -->
      <div id="venueDescWrap" style="display:${_selectedVenueType ? 'block' : 'none'}; margin-top:14px;">
        <label class="step-label" for="venueDesc">Describe your space <span class="opt">(optional)</span></label>
        <textarea class="field-input" id="venueDesc" rows="3"
          placeholder="${venueAsk(_selectedVenueType)}">${window._bookingNotes || ''}</textarea>
        <p class="venue-note">
          <i class="fa-solid fa-circle-info"></i>
          Pricing will be confirmed after our team visits your premises.
        </p>
      </div>
    </div>` : ''}

    ${hasQty ? `
    <div class="step-section">
      <label class="step-label">Number of ${unitLabel}</label>
      <div class="qty-row">
        <button class="qty-btn" id="qtyMinus"><i class="fa-solid fa-minus"></i></button>
        <span class="qty-val" id="qtyVal">${_quantity}</span>
        <button class="qty-btn" id="qtyPlus"><i class="fa-solid fa-plus"></i></button>
        <span class="qty-total">Total: ₹${inr(svc.price * _quantity)}</span>
      </div>
    </div>` : ''}

    <div class="step-btns">
      <button class="btn btn-outline" id="backToCatalog"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toAddressStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

function attachDetailsEvents(body) {
  // Quantity
  body.querySelector('#qtyMinus')?.addEventListener('click', () => {
    if (_quantity > 1) { _quantity--; renderBookingStep(); }
  });
  body.querySelector('#qtyPlus')?.addEventListener('click', () => {
    _quantity++;
    renderBookingStep();
  });

  // Back to catalog
  body.querySelector('#backToCatalog')?.addEventListener('click', () => {
    _step = 0;
    renderBookingStep();
  });

  // ── Commercial venue picker interactions ──
  body.querySelectorAll('.venue-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      _selectedVenueType = tile.dataset.venue;
      // Highlight selection
      body.querySelectorAll('.venue-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      // Show / hide "Other" text input
      const otherWrap = body.querySelector('#venueOtherWrap');
      const descWrap  = body.querySelector('#venueDescWrap');
      if (otherWrap) otherWrap.style.display = _selectedVenueType === 'other' ? 'block' : 'none';
      if (descWrap)  descWrap.style.display  = 'block';
      // Tailor the description prompt (e.g. chairs need a count, not sq ft)
      const desc = body.querySelector('#venueDesc');
      if (desc) desc.placeholder = venueAsk(_selectedVenueType);
      // Clear any previous validation error
      const err = body.querySelector('#venueError');
      if (err) err.textContent = '';
    });
  });

  // Live-save custom venue name
  body.querySelector('#venueOtherInput')?.addEventListener('input', e => {
    _customVenueName = e.target.value;
  });

  // Live-save space description into _bookingNotes
  body.querySelector('#venueDesc')?.addEventListener('input', e => {
    window._bookingNotes = e.target.value;
  });

  // Continue — validate commercial venue selection before proceeding
  body.querySelector('#toAddressStep')?.addEventListener('click', () => {
    if (_selectedService?.isCommercial) {
      if (!_selectedVenueType) {
        const err = body.querySelector('#venueError');
        if (err) err.textContent = 'Please select a venue type to continue.';
        return;
      }
      if (_selectedVenueType === 'other' && !_customVenueName.trim()) {
        const err = body.querySelector('#venueError');
        if (err) err.textContent = 'Please describe your venue type.';
        body.querySelector('#venueOtherInput')?.focus();
        return;
      }
      // Persist the description textarea before leaving
      const desc = body.querySelector('#venueDesc');
      if (desc) window._bookingNotes = desc.value;
    }
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
function showBookingConfirmed(orderId, { saved, isGuest, channel }) {
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

      ${channel === 'call' ? `
        <div class="booked-note">
          <i class="fa-solid fa-phone-volume"></i>
          Please mention <strong>${orderId}</strong> when you speak to us. You can also
          send the details on WhatsApp so we have everything in writing.
        </div>` : ''}

      ${isGuest ? `
        <div class="booked-note">
          <i class="fa-solid fa-circle-info"></i>
          Keep this order ID handy — it's how we find your booking. Tip: log in
          before your next booking to track every order in My Bookings.
        </div>` : ''}

      <div class="booked-actions">
        ${channel === 'call' ? `
          <button class="btn btn-whatsapp w-100" id="bookedSendWa">
            <i class="fa-brands fa-whatsapp"></i> Also send details on WhatsApp
          </button>` : ''}
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

  // Call bookings can still push the written details across afterwards.
  body.querySelector('#bookedSendWa')?.addEventListener('click', () => {
    const msg = buildWhatsAppMessage(orderId);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  });

  body.querySelector('#bookedClose')?.addEventListener('click', closeBooking);
}

/**
 * Single submit path for both WhatsApp and Call.
 * Order of operations matters: the order id and message are built
 * synchronously so `window.open` stays inside the user gesture (otherwise
 * popup blockers kill it), and the Firestore write happens after.
 */
function submitBooking({ channel }) {
  const orderId = makeOrderId();
  const isGuest = !auth.currentUser;

  if (channel === 'whatsapp') {
    const msg = buildWhatsAppMessage(orderId);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
  }

  // Show confirmation immediately; correct it if the write fails.
  showBookingConfirmed(orderId, { saved: true, isGuest, channel });

  saveBooking({ orderId, channel }).catch(err => {
    console.error('[booking] save failed', err);
    showBookingConfirmed(orderId, { saved: false, isGuest, channel });
  });
}

// ─── Step 3: Schedule + customer details ──────────────────────────────────────
function renderScheduleStep() {
  prefillContactFromProfile();
  const c = contact();
  const esc = s => String(s || '').replace(/"/g, '&quot;');

  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 60);

  return `
    <div class="step-section">
      <label class="step-label">When should we come?</label>
      <input class="field-input" type="date" id="schedDate"
             value="${esc(c.date)}" min="${yyyymmdd(today)}" max="${yyyymmdd(maxDate)}" />
      <p class="sched-hint" id="schedHint">
        ${c.date ? `<i class="fa-solid fa-calendar-check"></i> ${prettyDate(c.date)}` : 'Same-day and next-day slots are usually available.'}
      </p>
    </div>

    <div class="step-section">
      <label class="step-label">Your details</label>
      <div class="addr-grid">
        <div class="addr-field addr-wide">
          <label for="ctName">Full Name <span class="req">*</span></label>
          <input class="field-input" id="ctName" data-contact="name" value="${esc(c.name)}"
                 placeholder="e.g. Ramesh Kumar" autocomplete="name" />
        </div>
        <div class="addr-field addr-wide">
          <label for="ctEmail">Email <span class="opt">(optional)</span></label>
          <input class="field-input" id="ctEmail" data-contact="email" type="email" value="${esc(c.email)}"
                 placeholder="you@email.com — for your booking confirmation" autocomplete="email" />
        </div>
        <div class="addr-field">
          <label for="ctPhone">Mobile Number <span class="req">*</span></label>
          <input class="field-input" id="ctPhone" data-contact="phone" type="tel" value="${esc(c.phone)}"
                 placeholder="10-digit mobile" maxlength="10" inputmode="numeric" autocomplete="tel" />
        </div>
        <div class="addr-field">
          <label for="ctAltPhone">Alternate Number</label>
          <input class="field-input" id="ctAltPhone" data-contact="altPhone" type="tel" value="${esc(c.altPhone)}"
                 placeholder="Optional" maxlength="10" inputmode="numeric" />
        </div>
      </div>
      <p class="sched-hint">We'll call this number to confirm your booking.</p>
    </div>

    ${!auth.currentUser ? `
    <div class="info-chip">
      <i class="fa-solid fa-circle-info"></i>
      Booking as a guest is fine — create an account later to track your orders.
    </div>` : ''}

    <div class="step-btns">
      <button class="btn btn-outline" id="backToAddressFromSched"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <button class="btn btn-primary" id="toConfirmStep">Continue <i class="fa-solid fa-arrow-right"></i></button>
    </div>
  `;
}

// ─── Step 4: Summary + WhatsApp / Call CTA ────────────────────────────────────
function renderSummaryStep() {
  const svc   = _selectedService;
  const total = getTotal();

  return `
    <div class="confirm-rows">
      <div class="confirm-row"><span>Service</span><strong>${svc.title}</strong></div>
      ${_quantity > 1 ? `<div class="confirm-row"><span>Qty</span><strong>${_quantity}</strong></div>` : ''}
      ${svc.isFixed
        ? `<div class="confirm-row"><span>Price</span>
             <strong>₹${inr(total)}${svc.mrp ? ` <span class="save-badge">Save ₹${inr((svc.mrp - svc.price) * _quantity)}</span>` : ''}</strong>
           </div>`
        : `<div class="confirm-row"><span>Pricing</span><strong>Custom price</strong></div>`}
      <div class="confirm-row"><span>Address</span><strong>${escHtml(addressOneLine()) || '-'}</strong></div>
      ${addr().lat != null
        ? `<div class="confirm-row"><span>Location</span><strong class="geo-ok"><i class="fa-solid fa-location-dot"></i> GPS pinned</strong></div>`
        : ''}
      ${window._bookingNotes ? `<div class="confirm-row"><span>Notes</span><strong>${escHtml(window._bookingNotes)}</strong></div>` : ''}
      <div class="confirm-row"><span>Date</span><strong>${prettyDate(contact().date) || '-'}</strong></div>
      <div class="confirm-row"><span>Name</span><strong>${escHtml(contact().name) || '-'}</strong></div>
      ${contact().email ? `<div class="confirm-row"><span>Email</span><strong>${escHtml(contact().email)}</strong></div>` : ''}
      <div class="confirm-row"><span>Mobile</span><strong>+91 ${escHtml(contact().phone) || '-'}${contact().altPhone ? ` · +91 ${escHtml(contact().altPhone)}` : ''}</strong></div>
    </div>

    ${svc.isFixed
      ? `<div class="confirm-total fixed">
           <small><i class="fa-solid fa-hand-holding-heart"></i> Pay after service — cash or UPI</small>
         </div>`
      : `<div class="confirm-total quote">
           <div class="quote-note"><i class="fa-solid fa-comment-dots"></i> We'll confirm the final price after reviewing your requirement</div>
         </div>`}

    <p class="cta-heading">How would you like to confirm?</p>

    <div class="cta-btns">
      <button class="btn btn-whatsapp" id="ctaWhatsapp">
        <i class="fa-brands fa-whatsapp"></i> Send on WhatsApp
        <span class="cta-tag">Fastest</span>
      </button>
      <a class="btn btn-call" href="tel:+919613304724" id="ctaCall">
        <i class="fa-solid fa-phone"></i> Call Us
      </a>
    </div>
    <p class="cta-sub">
      <i class="fa-solid fa-circle-info"></i>
      Sending on WhatsApp is the quickest way for us to confirm — please remember to
      press send in WhatsApp.
    </p>

    <div class="step-btns" style="margin-top:16px;">
      <button class="btn btn-outline" id="backToAddress"><i class="fa-solid fa-arrow-left"></i> Back</button>
    </div>
  `;
}

function attachSummaryEvents(body) {
  // Back to Schedule & Your Details
  body.querySelector('#backToAddress')?.addEventListener('click', () => {
    _step = 3;
    renderBookingStep();
  });

  // Details were already collected and validated on the Schedule step, so both
  // channels can submit straight away — no more guest form at the last moment.
  body.querySelector('#ctaWhatsapp')?.addEventListener('click', () => {
    submitBooking({ channel: 'whatsapp' });
  });

  // Call Us — register the enquiry too, so phone bookings are tracked
  body.querySelector('#ctaCall')?.addEventListener('click', () => {
    submitBooking({ channel: 'call' });
  });
}

// ─── DOM wiring ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Service cards / "Book Service" buttons. data-book="" opens every category.
  document.querySelectorAll('[data-book]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openBooking(el.dataset.book);
    });
    // Service cards are role="button": Enter / Space must work like a click
    if (el.getAttribute('role') === 'button') {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBooking(el.dataset.book); }
      });
    }
  });

  // "Search" buttons open the sheet with the search box focused
  document.querySelectorAll('[data-book-search]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openBooking('', { focusSearch: true });
    });
  });

  // Other modules (the bottom tab bar) request the sheet with an event, so
  // they don't have to import this file or know its internals.
  document.addEventListener('mnu:book', (e) => {
    openBooking(e.detail?.id || '', { focusSearch: !!e.detail?.search });
  });

  paintFromPrices();

  const modal = document.getElementById('bookingModal');
  if (!modal) return;

  // Deep links from other pages and the app shortcut:
  //   /?book=root   /?book=kitchen   /?book=root&search=1
  // The parameter is removed afterwards so a refresh doesn't reopen the sheet.
  const params = new URLSearchParams(location.search);
  if (params.has('book')) {
    const want = params.get('book');
    openBooking(want === 'root' ? '' : want, { focusSearch: params.get('search') === '1' });
    params.delete('book');
    params.delete('search');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('modal-open')) closeBooking();
  });

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

    // Schedule + contact capture
    if (e.target.id === 'schedDate') {
      contact().date = e.target.value;
      const hint = document.getElementById('schedHint');
      if (hint) {
        hint.innerHTML = e.target.value
          ? `<i class="fa-solid fa-calendar-check"></i> ${prettyDate(e.target.value)}`
          : 'Same-day and next-day slots are usually available.';
      }
    }
    const ck = e.target.dataset?.contact;
    if (ck && CONTACT_FIELDS.includes(ck)) {
      let v = e.target.value;
      if (ck === 'phone' || ck === 'altPhone') {
        v = v.replace(/\D/g, '').slice(0, 10);
        if (e.target.value !== v) e.target.value = v;
      }
      contact()[ck] = v;
    }
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
    // Schedule step navigation
    if (e.target.closest('#backToAddressFromSched')) {
      _step = 2;
      renderBookingStep();
      return;
    }
    if (e.target.closest('#toConfirmStep')) {
      const c = contact();
      if (!c.date)                   { showToast('Please choose a service date'); return; }
      if (!c.name.trim())            { showToast('Please enter your full name');  return; }
      if (!/^\d{10}$/.test(c.phone)) { showToast('Enter a valid 10-digit mobile'); return; }
      // Email is optional — only validated if something was typed.
      if (c.email.trim() && !/^\S+@\S+\.\S+$/.test(c.email.trim())) {
        showToast('Please enter a valid email, or leave it blank'); return;
      }
      if (c.altPhone && !/^\d{10}$/.test(c.altPhone)) {
        showToast('Alternate number must be 10 digits'); return;
      }
      if (c.altPhone && c.altPhone === c.phone) {
        showToast('Alternate number must be different'); return;
      }
      _step = 4;
      renderBookingStep();
      return;
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
  modal.querySelector('[data-close-modal]')?.addEventListener('click', closeBooking);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeBooking();
  });
});
