/**
 * Username → email for Supabase signInWithPassword (resolveDemoEmail for auth-handler).
 *
 * CEOs / admin use @clubsensational.org only (no stf013/017/018/019 placeholders).
 */

/** @type {Record<string, string>} */
export const STAFF_USERNAME_TO_EMAIL = {
  Sandra: "stf001@staff.import.pending",
  Roberto: "stf002@staff.import.pending",
  Dan: "stf003@staff.import.pending",
  Angel: "stf004@staff.import.pending",
  Youssef: "stf005@staff.import.pending",
  John: "johnnyosti37@gmail.com",
  Bismark: "stf007@staff.import.pending",
  Giuseppe: "stf008@staff.import.pending",
  Godsway: "stf009@staff.import.pending",
  Javier: "stf010@staff.import.pending",
  Aurora: "stf011@staff.import.pending",
  Michelle: "michelle@youtimecounselling.com",
  "michelle@youtimecounselling.com": "michelle@youtimecounselling.com",
  Berta: "b.traperocasado@gmail.com",
  Victor: "victor@clubsensational.org",
  Carlos: "stf014@staff.import.pending",
  Alex: "stf015@staff.import.pending",
  Simon: "stf016@staff.import.pending",
  Luliya: "stf021@staff.import.pending",
  Lulia: "stf021@staff.import.pending",
  Andres: "stf022@staff.import.pending",
  Javi: "javier@clubsensational.org",
  Raul: "raul@clubsensational.org",
  Sevitha: "sevitha802@gmail.com",
  Teflon: "stf020@staff.import.pending",
  teflon: "stf020@staff.import.pending",
  "victor@clubsensational.org": "victor@clubsensational.org",
  "raul@clubsensational.org": "raul@clubsensational.org",
  "javier@clubsensational.org": "javier@clubsensational.org",
  "javi@clubsensational.org": "javi@clubsensational.org",
  "javier@clbusensational.org": "javier@clubsensational.org",
  "sevitha@clubsensational.org": "sevitha802@gmail.com",
  "sevitha802@gmail.com": "sevitha802@gmail.com",
  "info@clubsensational.org": "info@clubsensational.org",
};

/** Corporate login emails → staff key (redirects / role overrides). */
export const PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY = {
  "victor@clubsensational.org": "victor",
  "raul@clubsensational.org": "raul",
  "javier@clubsensational.org": "javi",
  "javi@clubsensational.org": "javi",
  "javier@clbusensational.org": "javi",
  "sevitha@clubsensational.org": "sevitha",
  "sevitha802@gmail.com": "sevitha",
  "info@clubsensational.org": "sevitha",
};

/** Placeholder emails retired for these four — do not use for sign-in. */
export const PORTAL_RETIRED_PLACEHOLDER_EMAILS = new Set([
  "stf013@staff.import.pending",
  "stf017@staff.import.pending",
  "stf018@staff.import.pending",
  "stf019@staff.import.pending",
]);

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
  "Name or email not recognised. Staff: use your first name as on the timetable. " +
  "Victor, Javi, Raúl: your @clubsensational.org email. Sevitha: sevitha802@gmail.com or info@clubsensational.org. " +
  "Michelle, Berta, John: your personal email.";

function isPlausibleLoginEmail(value) {
  const s = String(value || "").trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function resolveDemoEmail(rawUsername) {
  const trimmed = (rawUsername || "").trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (isPlausibleLoginEmail(trimmed)) {
    if (PORTAL_RETIRED_PLACEHOLDER_EMAILS.has(lower)) return null;
    if (STAFF_USERNAME_TO_EMAIL[trimmed]) return STAFF_USERNAME_TO_EMAIL[trimmed];
    if (STAFF_USERNAME_TO_EMAIL[lower]) return STAFF_USERNAME_TO_EMAIL[lower];
    if (PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[lower]) return lower;
    if (lower.endsWith("@clubsensational.org") || lower.endsWith("@clbusensational.org")) {
      return lower;
    }
    return lower;
  }

  if (/^stf\d{3}@staff\.import\.pending$/.test(lower)) {
    if (PORTAL_RETIRED_PLACEHOLDER_EMAILS.has(lower)) return null;
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

/** stf00x import emails → roster key used in spreadsheet bundle / term calendar. */
export const PORTAL_STAFF_CODE_TO_ROSTER_KEY = {
  stf001: "sandra",
  stf002: "roberto",
  stf003: "dan",
  stf004: "angel",
  stf005: "youssef",
  stf006: "john",
  stf007: "bismark",
  stf008: "giuseppe",
  stf009: "godsway",
  stf010: "javier",
  stf011: "aurora",
  stf012: "berta",
  stf013: "victor",
  stf014: "carlos",
  stf015: "alex",
  stf017: "javi",
  stf018: "raul",
  stf019: "sevitha",
  stf020: "teflon",
  stf021: "lulia",
  stf022: "andres",
};

/**
 * Normalize username / email local / display name → canonical roster key (lulia, roberto, …).
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function portalCanonicalStaffRosterKey(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (!k) return "";
  if (k === "luliya") return "lulia";
  if (k === "aida") return "lulia";
  if (k === "yousef" || k === "yousseff" || k === "yusef") return "youssef";
  return PORTAL_STAFF_CODE_TO_ROSTER_KEY[k] || k;
}

/**
 * Maps auth.users.email to a stable staff key for redirects.
 *
 * @param {string | null | undefined} authEmail
 * @returns {string}
 */
export function resolveStaffKeyFromAuthEmail(authEmail) {
  const e = String(authEmail || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  if (PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[e]) {
    return portalCanonicalStaffRosterKey(PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[e]);
  }
  const local = e.split("@")[0] || "";
  if (local && PORTAL_STAFF_CODE_TO_ROSTER_KEY[local]) {
    return PORTAL_STAFF_CODE_TO_ROSTER_KEY[local];
  }
  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    if (String(email).trim().toLowerCase() === e) {
      return portalCanonicalStaffRosterKey(name);
    }
  }
  return "";
}
