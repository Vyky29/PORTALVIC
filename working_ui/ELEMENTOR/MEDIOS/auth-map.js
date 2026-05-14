/**
 * Username → email for Supabase signInWithPassword (resolveDemoEmail for auth-handler).
 *
 * Source: SPREADSHEETS/Staff Timetable (PORTAL).xlsx + generated machine exports in database/.
 * Optional overlay: staff_login_map.json next to auth-handler.js (merged on first login; see mergeStaffLoginEmailMap).
 */

/** @type {Record<string, string>} */
export const STAFF_USERNAME_TO_EMAIL = {
  Sandra: "stf001@staff.import.pending",
  Roberto: "stf002@staff.import.pending",
  Dan: "stf003@staff.import.pending",
  Angel: "stf004@staff.import.pending",
  Youssef: "stf005@staff.import.pending",
  Yusef: "stf005@staff.import.pending",
  John: "stf006@staff.import.pending",
  Bismark: "stf007@staff.import.pending",
  Giuseppe: "stf008@staff.import.pending",
  Godsway: "stf009@staff.import.pending",
  Javier: "stf010@staff.import.pending",
  Aurora: "stf011@staff.import.pending",
  Berta: "stf012@staff.import.pending",
  Victor: "stf013@staff.import.pending",
  Carlos: "stf014@staff.import.pending",
  Alex: "stf015@staff.import.pending",
  Javi: "stf017@staff.import.pending",
  Raul: "stf018@staff.import.pending",
  Sevitha: "stf019@staff.import.pending",
  Demo: "stf020@staff.import.pending",
  demo: "stf020@staff.import.pending",
};

function normalizeMatchKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Normalized portal login name (single token) → Supabase email */
let STAFF_NORMALIZED_NAME_TO_EMAIL = {};

function rebuildNormalizedLookup() {
  STAFF_NORMALIZED_NAME_TO_EMAIL = {};
  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    const k = normalizeMatchKey(name);
    if (k) STAFF_NORMALIZED_NAME_TO_EMAIL[k] = email;
  }
}

rebuildNormalizedLookup();

/**
 * Merge extra name→email pairs (e.g. from staff_login_map.json next to auth-handler on the CDN).
 * Mutates STAFF_USERNAME_TO_EMAIL and refreshes normalized lookup.
 *
 * @param {Record<string, string> | null | undefined} extra
 */
export function mergeStaffLoginEmailMap(extra) {
  if (!extra || typeof extra !== "object") return;
  Object.assign(STAFF_USERNAME_TO_EMAIL, extra);
  rebuildNormalizedLookup();
}

/** Shown when the name field does not match any staff in STAFF_USERNAME_TO_EMAIL. */
export const PORTAL_LOGIN_UNKNOWN_NAME_HELP =
  "Name not recognised. Use your first name as on the timetable (same spelling). " +
  "Examples: Sandra, Roberto, Dan, Angel, Youssef, John, Bismark, Giuseppe, Godsway, Javier, Aurora, Berta, Victor, Carlos, Alex, Javi, Raul, Sevitha, Demo.";

/**
 * Login field = staff first name only OR full name (Nombre Apellido…).
 * Password is always the Supabase password for the mapped email.
 *
 * @param {string} rawUsername
 * @returns {string | null}
 */
export function resolveDemoEmail(rawUsername) {
  const trimmed = (rawUsername || "").trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (/^stf\d{3}@staff\.import\.pending$/.test(lower)) {
    for (const email of Object.values(STAFF_USERNAME_TO_EMAIL)) {
      if (String(email).toLowerCase() === lower) return lower;
    }
  }

  if (STAFF_USERNAME_TO_EMAIL[trimmed]) return STAFF_USERNAME_TO_EMAIL[trimmed];

  const norm = normalizeMatchKey(trimmed);
  if (!norm) return null;

  if (STAFF_NORMALIZED_NAME_TO_EMAIL[norm]) return STAFF_NORMALIZED_NAME_TO_EMAIL[norm];

  const first = norm.split(/\s+/)[0] || "";
  if (first && STAFF_NORMALIZED_NAME_TO_EMAIL[first]) {
    return STAFF_NORMALIZED_NAME_TO_EMAIL[first];
  }

  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    const nk = normalizeMatchKey(name);
    if (!nk) continue;
    if (norm === nk || norm.startsWith(nk + " ")) return email;
  }

  return null;
}

/**
 * Maps auth.users.email (e.g. stf012@…) to a stable staff key for redirects (berta, roberto, …).
 * Use when staff_profiles.username/full_name do not match our override keys.
 *
 * @param {string | null | undefined} authEmail
 * @returns {string}
 */
export function resolveStaffKeyFromAuthEmail(authEmail) {
  const e = String(authEmail || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    if (String(email).trim().toLowerCase() === e) {
      return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    }
  }
  return "";
}
