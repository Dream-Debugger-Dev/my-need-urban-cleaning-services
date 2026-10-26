# WORKING.md — MyNeedUrban Project

## Project Overview

**MyNeedUrban Cleaning Services** — A full-stack cleaning service platform serving Nanakramguda, Hyderabad (15 km radius).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
├─────────────────┬───────────────────────────────────────┤
│  Website (PWA)  │  Flutter App (Android + Web preview)  │
│  GitHub Pages   │  Google Play Store                    │
│  Public Repo    │  Private Repo                         │
└────────┬────────┴──────────────────┬────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   FIREBASE BACKEND                       │
├─────────────────────────────────────────────────────────┤
│  Auth (Phone OTP)  │  Firestore DB  │  Cloud Functions  │
│  FCM (Push Notif)  │  Storage       │  Hosting          │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   THIRD PARTY                            │
├─────────────────────────────────────────────────────────┤
│  Razorpay (Payments)  │  WhatsApp Business API          │
└─────────────────────────────────────────────────────────┘
```

## Repositories

| Repo | Visibility | Purpose |
|------|-----------|---------|
| `my-need-urban-cleaning-services` | Public | Marketing website + PWA (GitHub Pages) |
| `myneedurban-app` | Private | Flutter mobile app |
| `myneedurban-backend` | Private | Firebase Cloud Functions & rules |

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Website | HTML/CSS/JS (vanilla) | Fast, no build step, SEO-friendly |
| PWA | Service Worker + Manifest | iPhone users get app-like experience |
| Mobile App | Flutter (Dart) | Single codebase → Android + Web + iOS later |
| Backend | Firebase (Firestore, Functions, Auth, FCM) | Free tier, serverless, real-time |
| Payments | Razorpay | Indian-focused, UPI/cards, 2% per txn |
| Hosting | GitHub Pages (website) + Firebase Hosting (app) | Free |
| CI/CD | GitHub Actions | Auto-deploy on push |

## Development Setup

### Prerequisites
- Node.js v24+ (installed)
- Flutter 3.41.9+ (installed)
- Firebase CLI
- Git
- Chrome browser (for Flutter web preview)

### Running Locally

**Website:**
```bash
# From project root
npx serve web/
# Visit http://localhost:3000
```

**Flutter App (browser preview):**
```bash
cd app/
flutter run -d chrome
```

## Seasonal theme (Diwali 2026)

The home page dresses up for Diwali from 20 Oct to 11 Nov 2026 and goes back to
normal by itself. Small services (Bathroom, Sofa, Carpet) are paused for the same
dates.

- **Dates and paused services**: `js/diwali-boot.js` is the only place (`SEASON`,
  `DIWALI_AT`, `STAGES`, `PAUSE`). To extend the season change `SEASON.to` and
  `PAUSE.to`. Paused ids are the booking catalog's top-level ids in
  `js/booking.js` (`bathroom`, `sofa`, `carpet`). Remove an id to reopen it.
  The notice text in `index.html` must be changed to match
- **Preview**: `/?diwali=2026-11-08`, `/?diwali=2026-11-08T17:59:50` (the clock
  keeps running, so you can watch the countdown end), `/?diwali=off`
- **Pieces**: `css/diwali.css`, `js/diwali.js` (the page), `js/diwali-fx.js`
  (fireworks and sound, loaded only when effects are on), `js/diwali-card.js`
  (greeting card, loaded on demand), `js/diwali-art.js`, `js/festive-pause.js`
  (read by `js/booking.js`), photos and their credits in `assets/images/diwali/`
- **Remove for good**: delete the `.dw-only` blocks in `index.html`, the
  `css/diwali.css` link and the `diwali-boot.js` / `diwali.js` tags, then the
  files above, and the pause hooks in `js/booking.js` (search for `festivePaused`)

## Security Protocols

1. **Never commit secrets** — All API keys, Firebase configs, and credentials go in `.env` files (gitignored)
2. **Pre-commit hook** — Scans for potential secrets before allowing commits
3. **Separate repos** — Public website has zero sensitive code; app/backend are private
4. **Firebase Security Rules** — Firestore rules enforce auth-only access
5. **Environment variables** — All sensitive config loaded from environment, never hardcoded
6. **Browser protections and admin access** — see `SECURITY.md` (CSP on every page, login limits, staff sign-in by phone OTP only)

## Team

| Name | Role |
|------|------|
| Shankar Nath | Owner & Specialist |
| Hiran Nath | Team Lead |
| Raju Bhandari | Supervisor |
| Anshik Kewat | Operations, Bookings & Development |

## Branching Strategy

- `main` — Production (auto-deploys to GitHub Pages)
- `dev` — Development branch (merge to main when ready)
- `feature/*` — Feature branches (e.g., `feature/booking-form`)
- `fix/*` — Bug fix branches

## Deployment

- **Website:** Push to `main` → GitHub Pages auto-deploys
- **App:** Push to `main` in app repo → GitHub Actions builds APK
- **Backend:** `firebase deploy --only functions` from backend repo
