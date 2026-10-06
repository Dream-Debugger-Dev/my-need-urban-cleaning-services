# Security — www.myneedurban.com

The database rules and Cloud Functions that protect customer data live in
the platform repo (`backend/firestore.rules`, `backend/SECURITY.md`). This
site adds the browser-side layers:

- **Content-Security-Policy** (a `<meta>` tag at the top of every page):
  only scripts from this site, Firebase (`www.gstatic.com`) and Google
  reCAPTCHA can run. Injected `<script>` tags, inline `onerror=`/`onclick=`
  handlers and `javascript:` links are blocked. If you add a new third-party
  script, font or iframe, add its host to the policy in **every** page
  (`index.html`, `pages/*.html`) or it will be blocked.
- **Escaping**: anything a customer types is escaped before it is put on a
  page (`esc` / `escHtml` helpers). Never insert booking data with
  `innerHTML` unescaped.
- **Login limits** (`js/auth-guard.js`): a growing wait after 5 wrong
  passwords or OTPs, at most 3 OTP texts per 15 minutes, and a check that new
  passwords aren't easy to guess. Firebase enforces its own limits on top.
- **Staff sign-in is phone OTP only** (`js/admin.js`), and the number must be
  the one registered for that admin (`adminPhone`). The database rules refuse
  admin access to password sessions and to unregistered numbers, so the page
  never asks for a password.
- **No clickjacking**: Live Orders and My Bookings hide themselves if another
  website puts them in a frame.
- **Safe links**: only real Google Maps links become "Navigate" buttons, and
  only plain email addresses become mailto links. `?next=` after login only
  accepts known pages (no open redirect).
- **No personal data cached**: the service worker never stores Firebase
  responses; sign-out clears customer data from the admin page.

Found a problem? WhatsApp +91 96133 04724 or email the owner. Please don't
test against the live site with real customer data.
