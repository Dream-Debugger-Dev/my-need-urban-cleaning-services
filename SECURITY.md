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
  the one registered for that admin or staff member (`adminPhone`). The
  database rules refuse access to password sessions and to unregistered
  numbers, so the page never asks for a password. Staff can work on orders;
  only admins see **People** and the email **Settings** (hidden for staff, and
  the database and the `addStaff` / `updateTeamMember` / `removeStaff`
  functions refuse them anyway). The page also watches the signed-in person's
  own profile: when an admin changes their role or number, or removes them,
  their open page re-checks access within seconds instead of staying open
  until it is reloaded.
  Only `pages/admin.html` is allowed to talk to the Cloud Functions address
  (`https://asia-south1-myneedurban-ec1c9.cloudfunctions.net`) in its policy.
- **Bookings need a verified mobile number** (`js/booking.js`, `js/identity.js`):
  the last step makes the customer verify their number with an OTP (or log
  in), and the booking is saved under their account. A customer who signs in
  with a number can add and verify an email, and one who signs in with an
  email must add and verify a number: both end up on one account.
- **No clickjacking**: the admin app and My Bookings hide themselves if another
  website puts them in a frame.
- **Safe links**: only real Google Maps links become "Navigate" buttons, and
  only plain email addresses become mailto links. `?next=` after login only
  accepts known pages (no open redirect).
- **No personal data cached**: the service worker never stores Firebase
  responses; sign-out clears customer data from the admin page.

Found a problem? WhatsApp +91 96133 04724 or email the owner. Please don't
test against the live site with real customer data.
