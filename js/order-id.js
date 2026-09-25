/* ===============================
   MyNeedUrban — order-id.js
   Human-friendly order IDs: MNU-YYMMDD-XXXXX

   Shared by the booking sheet (booking.js) and the call-back form (form.js).
   It lives in its own module so neither has to import the other — importing
   booking.js from a second place would run a second copy of it.
   =============================== */

// Ambiguous characters (0/O, 1/I/L, 2/Z, 5/S, 8/B) are excluded because staff
// read these out over the phone.
const CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';
const TAIL = 5; // 25^5 ≈ 9.8M combinations per day

export function makeOrderId(now = new Date()) {
  const ymd = String(now.getFullYear()).slice(2)
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0');
  // Crypto-backed randomness where available, so two customers booking in the
  // same second can't land on the same id.
  const bytes = new Uint8Array(TAIL);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < TAIL; i++) bytes[i] = Math.floor(Math.random() * 256);

  let tail = '';
  for (let i = 0; i < TAIL; i++) tail += CHARS[bytes[i] % CHARS.length];
  return `MNU-${ymd}-${tail}`;
}
