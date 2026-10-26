/* ==========================================================================
   MyNeedUrban — festive-pause.js
   Which services are paused right now, for js/booking.js and js/diwali.js.

   It only READS window.MNU_FESTIVE, which js/diwali-boot.js publishes (and
   only inside the festive season). Out of season there is nothing there, so
   every function below answers "nothing is paused" and the booking flow
   behaves exactly as it always does.
   ========================================================================== */

const state = () => (typeof window !== 'undefined' && window.MNU_FESTIVE && window.MNU_FESTIVE.pause) || null;

/** True while the festive pause is in force. */
export function pauseOn() {
  const p = state();
  return !!(p && p.on);
}

/** Is this top-level catalog service (e.g. "sofa") paused right now? */
export function isPausedId(rootId) {
  const p = state();
  return !!(p && p.on && p.ids.includes(rootId));
}

/** The names shown in the notice, e.g. "Washroom Cleaning". */
export function pausedNames() {
  const p = state();
  return p && p.on ? p.names.slice() : [];
}

/**
 * Words that point at a paused service that has no page of its own on the
 * site ("balcony", "single room"). Returns its name, or '' for no match.
 */
export function pausedTerm(query) {
  const p = state();
  if (!p || !p.on) return '';
  const q = String(query || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  for (const [term, name] of Object.entries(p.terms || {})) {
    if (q.includes(term)) return name;
  }
  return '';
}

/**
 * Ask the page to show the friendly "paused for the festive season" window.
 * js/diwali.js answers the event. If nothing answers (its script did not load),
 * `fallback(text)` is used so the visitor is never left with a button that
 * silently does nothing.
 */
export function showPauseNotice({ title = 'This service', fallback } = {}) {
  const handled = !document.dispatchEvent(new CustomEvent('mnu:paused', { cancelable: true, detail: { title } }));
  if (!handled && typeof fallback === 'function') {
    fallback(`${title} bookings are paused for the festive season. Thank you for your understanding.`);
  }
  return true;
}
