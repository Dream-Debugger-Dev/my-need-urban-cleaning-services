# CHANGELOG

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.5.0] — 2026-10-19

### Changed
- **Booking: Proceed, then verify.** The last step of the booking sheet now has
  one **Proceed** button. The "Send on WhatsApp" and "Call Us" buttons are
  gone from it. Proceed asks the customer to verify their mobile number with
  an OTP (or log in with their email), saves the booking under their account,
  and shows the order ID with a **Track my order** button. A customer who is
  already logged in with a verified number just taps **Confirm booking**
- A booking is shown as received only once it is really saved. On a weak
  connection the customer sees "We couldn't save your booking yet" with
  **Try again**; trying again can never create a second booking
- **My Bookings**: every open booking has **Send details on WhatsApp**, which
  opens WhatsApp to the team with the booking's details (service, price,
  address with a Maps link, date, contact). **Get help** stays
- Booking records now say `channel: "website"` (they used to say whatsapp or
  call); Live Orders and the owner email show it as "Website"
- Staff can now work in Live Orders too: the page accepts the new **staff**
  role as well as **admin**

### Added
- **One account, two verified logins** (`js/identity.js`). My Bookings has a
  "Your login details" card: a customer who signed in with their number adds
  and verifies an email (a verification link is sent; it counts once they tap
  it); a customer who signed in with an email adds and verifies a mobile
  number by OTP (needed to book). Both are attached to the same account, so
  either one logs in to the same bookings. New email sign-ups get the
  verification link straight away
- **Team & alerts** on the admin page (admins only, menu ⋮): add or remove
  staff by mobile number, send them the sign-in link on WhatsApp, and choose
  which email addresses get the new-booking emails (up to 5, with switches for
  the owner emails and the customer emails)

### Security
- Staff role with limited access, the alert-email settings and the staff
  functions are described in the platform repo (`backend/SECURITY.md`)
- `pages/admin.html` may now reach the Cloud Functions address; no other page
  was widened. The Content-Security-Policy is otherwise unchanged
- Cache version moved to `20261019a`

---

## [1.4.0] — 2026-10-14

### Added
- Navratri · Bathukamma · Dasara festival layer on the home page. It sits
  under the hero as a card with: the nine Navratri nights lit one by one in
  each night's colour (today's colour and goddess highlighted), today's
  Bathukamma name, a countdown to Dasara (20 Oct), a "Book Home Deep
  Cleaning" button, "Share wishes" (WhatsApp / share sheet), a downloadable
  greeting card (1080×1350 JPEG, made in the visitor's browser), a marigold
  toran over the hero, drifting petals, a slow rangoli mandala and a festive
  line in the footer. Home Deep Cleaning gets a "Festive pick" badge (just a
  diya on phones)
- Self-expiring: on for 10–21 Oct 2026 (India time), then the page is normal
  again with nothing to deploy. Preview any day with `?fest=2026-10-19`,
  switch it off with `?fest=off`
- Everything is drawn in code (canvas/SVG): no images, videos or new
  third-party hosts, no inline scripts, and the Content-Security-Policy is
  unchanged. Off-season only the two small loader scripts run (and exit at
  once); the styles, art, petals and card are never downloaded
- `js/festival-boot.js` runs in `<head>` and reserves the card's height before
  the first paint, so the page does not jump when the card appears
  (layout shift 0.226 → 0 on phones)

### Fixed (same day, found on the live site)
- On phones (up to 768px wide) the left of the festive card's text was cut off
  ("Shubh Navratri" showed as "Navratri"). The card's column layout centred its
  content, so the nine-night row made the text column wider than the card.
  The content now fills the card's width, the Telugu/Hindi greetings use the
  full width, and the reserved heights (`css/app.css`) were measured again for
  the taller phone card (480-636px depending on width)

### Good to know
- Calendars differ by a day between regions. The dates are in `js/festival.js`
  (`SEASON`, `DASARA`, `NAVRATRI`, Bathukamma list) and, for the three season
  dates, repeated in `js/festival-boot.js`. Change both
- Petals stop on slow phones, with Data Saver or "reduce motion", while the
  greeting card is open, and when the hero is off-screen
- To remove it for good, see the comment at the top of `js/festival.js`
- Cache version moved to `20261014b`

---

## [1.3.1] — 2026-10-06

### Security
- Live Orders also requires the signed-in phone number to be the one
  registered for that admin (`adminPhone`), matching the new database rules.
  An intruder who attaches their own phone to an admin account sees
  "Number not registered" and no data
- The "No admin access" screen shows the exact `role` and `adminPhone`
  values for the owner to set

---

## [1.3.0] — 2026-09-29

### Security
- Staff sign-in on Live Orders is phone OTP only; the database rules refuse
  admin access to password sessions
- Wrong passwords / OTPs: growing wait after 5 tries; OTP texts limited to
  3 per 15 minutes, 30 s apart (`js/auth-guard.js`)
- New passwords: 8+ characters, letters mixed with numbers or symbols, not
  common, not only digits, not the person's name or email
- Content-Security-Policy and Referrer-Policy on every page; injected
  scripts, inline handlers and `javascript:` links are blocked
- Live Orders and My Bookings refuse to run inside another website's frame
- Only real Google Maps links become Navigate buttons; only plain email
  addresses become mailto links
- Customer text is escaped everywhere it is shown again; booking fields are
  capped at the lengths the database accepts, so long answers can't make a
  booking fail
- See `SECURITY.md`

### Fixed
- "Resend OTP" failed until the page was reloaded: reCAPTCHA was drawn into
  the Send button, and Google's reCAPTCHA refuses to draw twice in the same
  element. Each OTP request now gets a fresh element (login, sign-up and
  staff sign-in)

---

## [1.2.0] — 2026-05-13

### Changed
- Complete brand rebrand: Teal/mint → Navy + Electric Blue + Orange palette
- Header now dark navy with glassmorphism effect
- Hero section dark background with blue/orange radial glows
- Team section updated with real team members (avatar placeholders)
- Reviews section replaced with auto-scrolling marquee (real Google reviews)
- Social links updated to real Instagram, Facebook, YouTube profiles
- Logo and favicon updated to v3

### Added
- Marquee/carousel review system (two rows, opposite scroll directions)
- Google logo on review cards with dates and "Local Guide" badges
- Team avatar placeholder component (initial-based)
- Edge fade effect on review marquee

### Removed
- Stock Unsplash team photos (replaced with initial avatars)
- Static 3-card review grid (replaced with marquee)
- Teal/mint color variables

---

## [1.1.0] — 2026-05-13

### Added
- Logo v2 integrated in header and footer
- Favicon v2 added
- Assets folder structure (`assets/logo/`, `assets/favicon/`)

### Changed
- Replaced text-based "MNU" brand mark with actual logo image
- CSS `.brand-mark` replaced with `.brand-logo` class

---

## [1.0.0] — 2026-05-13

### Added
- Initial release — single-page marketing website
- Sticky glassmorphism header with mobile nav
- Hero section with trust strip and dual CTAs
- About section with stat card
- Services section (12 service cards with pricing)
- Pricing section (3 packages: Essential, Deep Clean, Premium)
- Why Choose Us section (6 feature cards)
- Before/After draggable image slider
- Team section
- Customer reviews (3 cards)
- FAQ accordion
- Contact form + Google Maps embed
- Footer with social links
- Floating WhatsApp button
- Scroll-reveal animations (IntersectionObserver)
- Scrollspy active nav highlighting
- SEO meta tags + LocalBusiness JSON-LD schema
- Custom domain setup (myneedurban.com via GitHub Pages)
- CNAME file for DNS configuration
