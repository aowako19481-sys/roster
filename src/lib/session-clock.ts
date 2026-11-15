/**
 * Kinu holds sensitive records, so a signed-in session is kept short:
 *   - it ends after 30 minutes without activity (a warning counts down first);
 *   - it ends when Kinu has been closed (no Kinu page open for a short while);
 *   - its cookies are not kept once the browser itself is closed.
 * These names and limits are shared by the proxy, the sign-in actions and the
 * small on-page guard. Nothing here is secret.
 */
export const SEEN_COOKIE = "kinu_seen";       // last request, set by the server only
export const ALIVE_COOKIE = "kinu_alive";     // "a Kinu page is open", refreshed by the page
export const WHO_COOKIE = "kinu_who";         // the account remembered on this device, if the person asked
export const REMEMBER_COOKIE = "kinu_remember";

export const IDLE_MS = 30 * 60 * 1000;
export const CLOSED_MS = 90 * 1000;
export const WARN_SECONDS = 10;
export const REMEMBER_DAYS = 180;
