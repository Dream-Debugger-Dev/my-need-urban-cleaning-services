# MyNeedUrban — Setup & Continuation Guide

Last updated: September 9, 2026  
Written for: picking up work on a new machine

---

## Repos

| Repo | What's in it | GitHub |
|------|-------------|--------|
| `my-need-urban-cleaning-services` | Website (HTML/CSS/JS) deployed on GitHub Pages | `Dream-Debugger-Dev/my-need-urban-cleaning-services` |
| `myneedurban-platform` | Flutter app + Firebase Cloud Functions backend | `Dream-Debugger-Dev/myneedurban-platform` |

---

## Firebase Project

- **Project ID:** `myneedurban-ec1c9`
- **Plan:** Blaze (pay-as-you-go) — budget alert set at ₹500/month
- **Console:** https://console.firebase.google.com/project/myneedurban-ec1c9
- **Auth:** Phone OTP + Email/Password enabled
- **Firestore:** Active — collections: `users`, `bookings`, `notifications`
- **Hosting:** GitHub Pages (CNAME set), not Firebase Hosting

---

## Website Structure (`my-need-urban-cleaning-services`)

```
index.html              Main page — service cards, booking modal, auth modals
css/
  style.css             All styles
  animations.css        Scroll/entrance animations
js/
  firebase-config.js    Firebase init + all exports
  auth.js               Phone OTP + Email login/signup, FCM token save
  booking.js            5-step booking wizard (no login required)
  main.js               Scroll, header, misc
  slider.js             Image slider
  form.js               Contact form
  pwa.js                PWA install prompt
pages/
  account.html          Customer order tracking page
  admin.html            Live orders admin dashboard
  terms.html
  privacy.html
assets/
  images/               Real photos (after-cleaning shots)
  logo/                 Brand logos
  favicon/              Favicons
  pwa/                  PWA icons (192, 512, maskable)
firebase-messaging-sw.js  FCM background push notification service worker
manifest.webmanifest    PWA manifest
sw.js                   App service worker (caching)
```

---

## Booking Flow (5 steps — no login required)

1. **Service** — Browse catalog tree (Deep Cleaning, Bathroom, Kitchen, Sofa, etc.)
2. **Details** — Package info, what's included/not, quantity selector
3. **Address** — 6-field address form + GPS pin + live Google Maps preview
4. **Schedule & Your Details** — Preferred date + name/phone/email
5. **Confirm** — Summary → **Send on WhatsApp** or **Call Us**

WhatsApp opens a pre-filled message with full booking details.  
Booking is saved to Firestore `bookings` collection regardless of login status.

---

## Admin Panel (`pages/admin.html`)

- **URL:** `https://myneedurban.com/pages/admin.html`
- Protected by Firestore role check — only users with `role: "admin"` can access
- Real-time live orders via `onSnapshot`
- Features: stats row, filter chips, status progression, Call/WhatsApp/Map actions, sound alerts, browser push notifications
- **To set yourself as admin:** See "Making a User Admin" section below

---

## Cloud Functions (`myneedurban-platform/backend/`)

### Functions built (TypeScript, Node 20)

| Function | Trigger | What it does |
|----------|---------|--------------|
| `onNewBooking` | New doc in `bookings/` | Sends email to owner + confirmation email to customer + FCM push to all admins |
| `onBookingStatusChange` | `bookings/` doc updated | Sends status update email to customer + FCM push to customer device |
| `sendNotificationToAdmin` | New doc in `bookings/` | FCM multicast to all admin FCM tokens |
| `sendNotificationToCustomer` | New doc in `notifications/` | FCM push to specific customer |
| `setAdminRole` | HTTPS Callable | Promotes a user to admin (admin-only) |

### ⚠️ IMPORTANT — Functions are NOT deployed yet

You need to do this before emails and push notifications work:

#### Step 1 — Install Firebase CLI (if not already)
```bash
npm install -g firebase-tools
firebase login
```

#### Step 2 — Set secret environment variables
```bash
cd myneedurban-platform/backend

firebase functions:secrets:set GMAIL_USER
# Enter: your Gmail address (e.g. myneedurban@gmail.com)

firebase functions:secrets:set GMAIL_PASS
# Enter: Gmail App Password (NOT your real password)
# Get it from: Google Account → Security → 2-Step Verification → App passwords

firebase functions:secrets:set OWNER_EMAIL
# Enter: email where owner notifications should go

firebase functions:secrets:set OWNER_PHONE
# Enter: 919613304724
```

#### Step 3 — Install dependencies and deploy
```bash
cd myneedurban-platform/backend/functions
npm install

cd ..
firebase deploy --only functions,firestore
```

---

## Making a User Admin

Currently there's no UI for this. Do it directly in Firestore:

1. Go to https://console.firebase.google.com/project/myneedurban-ec1c9/firestore
2. Open the `users` collection
3. Find your user document (by UID or phone number)
4. Edit the `role` field — change `"customer"` to `"admin"`

After this, that account can access `pages/admin.html` and use the `setAdminRole` Cloud Function to promote others.

---

## FCM / Push Notifications

- Web push uses the FCM VAPID key
- **Get the real VAPID key:** Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair → copy the key
- Update it in `js/auth.js` — search for `VAPID_KEY` and replace the placeholder value
- The `firebase-messaging-sw.js` at the root handles background notifications

---

## WhatsApp Number

Defined in `js/booking.js`:
```js
const WHATSAPP_NUMBER = '919613304724'; // wa.me format — no + prefix
```

Also hardcoded in `pages/account.html` and `pages/admin.html` for customer support links.

---

## Firestore Collections

### `users`
```
uid (doc id)
  name: string
  phone: string
  email: string
  role: 'customer' | 'admin'
  fcmToken: string        ← saved on login for push notifications
  createdAt: timestamp
```

### `bookings`
```
orderId: 'MNU-YYMMDD-XXXXX'
status: 'pending' | 'confirmed' | 'inProgress' | 'completed' | 'cancelled'
source: 'website'
channel: 'whatsapp' | 'call'
customerId: string | null   ← null for guests
isGuest: boolean
customerName, customerPhone, customerAltPhone, customerEmail
scheduledDate: 'YYYY-MM-DD'
serviceId, serviceName, servicePath
pricingType: 'fixed' | 'quote'
quantity, amount, mrp, priceUnit
address: string (multi-line)
addressParts: { flat, building, street, landmark, city, pincode }
geo: { lat, lng } | null
mapsLink: string
notes: string
createdAt: timestamp
```

### `notifications`
```
targetUserId: string
title, body: string
bookingId, orderId: string
createdAt: timestamp
```

---

## Firestore Security Rules

File: `myneedurban-platform/backend/firestore.rules`

Key rules:
- **Guests can create bookings** (no auth required for `bookings` create)
- **Customers can cancel their own pending bookings** (only status field, only their own)
- **Admins can do everything**
- **Admin panel is protected** — non-admins get Access Denied

---

## Pending / TODO

- [ ] Deploy Cloud Functions (see steps above)
- [ ] Get real VAPID key from Firebase Console and update `js/auth.js`
- [ ] Set yourself as admin in Firestore (see above)
- [ ] Test email flow end-to-end after deploying functions
- [ ] Consider adding Google Sign-In for easier login
- [ ] Password reset flow for email login not yet built
- [ ] Time slot selection removed — discuss on WhatsApp when to re-add
- [ ] `myneedurban-platform` Flutter app — separate work, not connected to website yet

---

## Local Development

The website is plain HTML/CSS/JS — no build step needed.  
Just open `index.html` in a browser, or use VS Code Live Server.

For Cloud Functions:
```bash
cd myneedurban-platform/backend/functions
npm install
npm run build        # compiles TypeScript
```

---

## Git Workflow

Always work on `main` for both repos.  
Two additional branches exist (not merged yet):
- `feature/independence-day-theme`
- `feature/kitchen-deep-cleaning-pricing`

```bash
git pull              # sync before starting
git add -A
git commit -m "your message"
git push
```
