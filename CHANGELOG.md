# CHANGELOG

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
