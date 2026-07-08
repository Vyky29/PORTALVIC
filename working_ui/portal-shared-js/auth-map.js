/**
 * Username → email for Supabase signInWithPassword (resolveDemoEmail for auth-handler).
 *
 * Executives: victor@, javi@ (Palankas Arranz CEO), raul@, sevitha@ (Auth users).
 * javier@ → login alias for javi@ (same CEO Auth user; not staff Javier Marquez).
 * info@ → login alias for Sevitha (same Auth as sevitha@).
 * admin@ → system From address only (no portal login).
 *
 * Staff roster keys: javi = Palankas Arranz (CEO), javier = Javier Marquez (swimming).
 */

/** Canonical Auth emails for CEO + admin (one Supabase user each). CEO Auth email may be javier@; staff key is javi. */
export const PORTAL_EXECUTIVE_AUTH_EMAILS = [
  "victor@clubsensational.org",
  "javier@clubsensational.org",
  "javi@clubsensational.org",
  "raul@clubsensational.org",
  "sevitha@clubsensational.org",
];

/** Typed login / typo → Auth email (no second Auth user). */
export const PORTAL_CORPORATE_LOGIN_EMAIL_ALIASES = {
  "info@clubsensational.org": "sevitha@clubsensational.org",
  "javi@clubsensational.org": "javier@clubsensational.org",
  "javier@clbusensational.org": "javier@clubsensational.org",
};

/** Public contact + outbound mail (not separate Auth logins). */
export const PORTAL_MAIL_CONTACT_EMAIL = "info@clubsensational.org";
export const PORTAL_MAIL_FROM_EMAIL = "admin@clubsensational.org";
export const PORTAL_MAIL_SAFEGUARDING_EMAIL = "management@clubsensational.org";

/** Do not use for sign-in (reserved for SMTP / comms). */
export const PORTAL_MAILBOX_ONLY_EMAILS = new Set([
  PORTAL_MAIL_FROM_EMAIL.toLowerCase(),
  PORTAL_MAIL_SAFEGUARDING_EMAIL.toLowerCase(),
]);

/** Retired import placeholders + personal emails for executives. */
export const PORTAL_RETIRED_PLACEHOLDER_EMAILS = new Set([
  "stf013@staff.import.pending",
  "stf017@staff.import.pending",
  "stf018@staff.import.pending",
  "stf019@staff.import.pending",
]);

export const PORTAL_RETIRED_LOGIN_EMAILS = new Set([
  "sevitha802@gmail.com",
]);

/**
 * @param {string} rawEmail
 * @returns {string}
 */
export function resolveCorporateAuthEmail(rawEmail) {
  const lower = String(rawEmail || "").trim().toLowerCase();
  if (!lower) return lower;
  return PORTAL_CORPORATE_LOGIN_EMAIL_ALIASES[lower] || lower;
}

/** First-name login for executives (Javi = CEO Arranz; Javier = staff Marquez via STAFF_USERNAME_TO_EMAIL). */
export const PORTAL_EXECUTIVE_LOGIN_NAMES = {
  victor: "victor@clubsensational.org",
  javi: "javier@clubsensational.org",
  raul: "raul@clubsensational.org",
  sevitha: "sevitha@clubsensational.org",
  info: "sevitha@clubsensational.org",
};

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
  "Javier Marquez": "stf010@staff.import.pending",
  Aurora: "stf011@staff.import.pending",
  "Aurora Garcia": "stf011@staff.import.pending",
  Michelle: "michelle@youtimecounselling.com",
  "michelle@youtimecounselling.com": "michelle@youtimecounselling.com",
  Berta: "b.traperocasado@gmail.com",
  Victor: "victor@clubsensational.org",
  Carlos: "stf014@staff.import.pending",
  Alex: "stf015@staff.import.pending",
  Simon: "stf016@staff.import.pending",
  Luliya: "stf021@staff.import.pending",
  Lulia: "stf021@staff.import.pending",
  Aida: "stf021@staff.import.pending",
  "Aida Luliya": "stf021@staff.import.pending",
  Andres: "stf022@staff.import.pending",
  Javi: "javi@clubsensational.org",
  Palankas: "javi@clubsensational.org",
  "Palankas Arranz": "javi@clubsensational.org",
  "Palankas Arranz Escorial": "javi@clubsensational.org",
  "Javi Arranz": "javi@clubsensational.org",
  "Javi Arranz Escorial": "javi@clubsensational.org",
  Raul: "raul@clubsensational.org",
  Sevitha: "sevitha@clubsensational.org",
  Teflon: "stf020@staff.import.pending",
  teflon: "stf020@staff.import.pending",
  "victor@clubsensational.org": "victor@clubsensational.org",
  "raul@clubsensational.org": "raul@clubsensational.org",
  "javi@clubsensational.org": "javi@clubsensational.org",
  "javier@clubsensational.org": "javi@clubsensational.org",
  "javier@clbusensational.org": "javi@clubsensational.org",
  "sevitha@clubsensational.org": "sevitha@clubsensational.org",
  "info@clubsensational.org": "sevitha@clubsensational.org",
};

/** Corporate login emails → staff key (redirects / role overrides). */
export const PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY = {
  "victor@clubsensational.org": "victor",
  "raul@clubsensational.org": "raul",
  "javi@clubsensational.org": "javi",
  "javier@clubsensational.org": "javi",
  "javier@clbusensational.org": "javi",
  "sevitha@clubsensational.org": "sevitha",
  "info@clubsensational.org": "sevitha",
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
    if (k) STAFF_NORMALIZED_NAME_TO_EMAIL[k] = resolveCorporateAuthEmail(email);
  }
}

rebuildNormalizedLookup();

/**
 * Merge extra name→email pairs (e.g. from staff_login_map.json next to auth-handler on the CDN).
 * Mutates STAFF_USERNAME_TO_EMAIL and refreshes normalized lookup.
 *
 * @param {Record<string, string> | null | undefined} extra
 */
const PORTAL_LOGIN_MAP_PROTECTED_KEYS = new Set([
  "Victor",
  "Javi",
  "Raul",
  "Sevitha",
  "Info",
  "victor@clubsensational.org",
  "javi@clubsensational.org",
  "javier@clubsensational.org",
  "raul@clubsensational.org",
  "sevitha@clubsensational.org",
  "info@clubsensational.org",
]);

export function mergeStaffLoginEmailMap(extra) {
  if (!extra || typeof extra !== "object") return;
  const incoming =
    extra.staff_username_to_email && typeof extra.staff_username_to_email === "object"
      ? extra.staff_username_to_email
      : extra;
  for (const [key, email] of Object.entries(incoming)) {
    if (PORTAL_LOGIN_MAP_PROTECTED_KEYS.has(key)) {
      const cur = STAFF_USERNAME_TO_EMAIL[key];
      if (cur && String(cur).toLowerCase().endsWith("@clubsensational.org")) continue;
    }
    STAFF_USERNAME_TO_EMAIL[key] = email;
  }
  PORTAL_REGISTERED_LOGIN_EMAILS = null;
  rebuildNormalizedLookup();
}

/** Shown when the name field does not match any staff in STAFF_USERNAME_TO_EMAIL. */
export const PORTAL_LOGIN_UNKNOWN_NAME_HELP =
  "Name or email not recognised. Only club staff can use this portal — contact the office if you need access.";

/** Cached set of Supabase Auth emails allowed to sign in (values from staff login map). */
let PORTAL_REGISTERED_LOGIN_EMAILS = null;

export function portalRegisteredLoginEmailsSet() {
  if (PORTAL_REGISTERED_LOGIN_EMAILS) return PORTAL_REGISTERED_LOGIN_EMAILS;
  const set = new Set();
  for (const email of Object.values(STAFF_USERNAME_TO_EMAIL)) {
    const resolved = resolveCorporateAuthEmail(String(email || "").trim());
    if (resolved) set.add(resolved.toLowerCase());
  }
  for (const email of PORTAL_EXECUTIVE_AUTH_EMAILS) {
    set.add(String(email || "").trim().toLowerCase());
  }
  for (const alias of Object.keys(PORTAL_CORPORATE_LOGIN_EMAIL_ALIASES)) {
    set.add(resolveCorporateAuthEmail(alias).toLowerCase());
  }
  PORTAL_REGISTERED_LOGIN_EMAILS = set;
  return set;
}

/** True when this email is on the portal roster (before Supabase Auth is called). */
export function portalIsRegisteredPortalLoginEmail(rawEmail) {
  const lower = resolveCorporateAuthEmail(String(rawEmail || "").trim()).toLowerCase();
  if (!lower) return false;
  return portalRegisteredLoginEmailsSet().has(lower);
}

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
    if (PORTAL_RETIRED_LOGIN_EMAILS.has(lower)) return null;
    if (PORTAL_MAILBOX_ONLY_EMAILS.has(lower)) return null;

    if (STAFF_USERNAME_TO_EMAIL[trimmed]) {
      return resolveCorporateAuthEmail(STAFF_USERNAME_TO_EMAIL[trimmed]);
    }
    if (STAFF_USERNAME_TO_EMAIL[lower]) {
      return resolveCorporateAuthEmail(STAFF_USERNAME_TO_EMAIL[lower]);
    }
    if (PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[lower]) {
      return resolveCorporateAuthEmail(lower);
    }
    const resolved = resolveCorporateAuthEmail(lower);
    if (portalIsRegisteredPortalLoginEmail(resolved)) {
      return resolved;
    }
    return null;
  }

  if (/^stf\d{3}@staff\.import\.pending$/.test(lower)) {
    if (PORTAL_RETIRED_PLACEHOLDER_EMAILS.has(lower)) return null;
    for (const email of Object.values(STAFF_USERNAME_TO_EMAIL)) {
      if (String(email).toLowerCase() === lower) return lower;
    }
  }

  if (STAFF_USERNAME_TO_EMAIL[trimmed]) {
    return resolveCorporateAuthEmail(STAFF_USERNAME_TO_EMAIL[trimmed]);
  }

  const norm = normalizeMatchKey(trimmed);
  if (!norm) return null;

  if (PORTAL_EXECUTIVE_LOGIN_NAMES[norm]) {
    return PORTAL_EXECUTIVE_LOGIN_NAMES[norm];
  }

  if (STAFF_NORMALIZED_NAME_TO_EMAIL[norm]) {
    return resolveCorporateAuthEmail(STAFF_NORMALIZED_NAME_TO_EMAIL[norm]);
  }

  const first = norm.split(/\s+/)[0] || "";
  if (first && STAFF_NORMALIZED_NAME_TO_EMAIL[first]) {
    return STAFF_NORMALIZED_NAME_TO_EMAIL[first];
  }

  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    const nk = normalizeMatchKey(name);
    if (!nk) continue;
    if (norm === nk || norm.startsWith(nk + " ")) {
      return resolveCorporateAuthEmail(email);
    }
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
  if (k === "lulya") return "lulia";
  if (k === "aida") return "lulia";
  if (k === "yousef" || k === "yousseff" || k === "yusef") return "youssef";
  if (k === "javiermarquez") return "javier";
  if (k === "javiarranz" || k === "javiarranzescorial") return "javi";
  if (k === "palankas" || k === "palankasarranz" || k === "palankasarranzescorial") return "javi";
  return PORTAL_STAFF_CODE_TO_ROSTER_KEY[k] || k;
}

/**
 * Human-facing staff label — Luliya (not Lulia/Lulya/Aida), Javier (not Javi),
 * Javi Palankas for CEO (not Javier/Javi alone).
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function portalStaffDisplayName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const norm = (s) =>
    String(s || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const fromKey = (k) => {
    if (!k) return "";
    if (k === "luliya" || k === "lulia" || k === "lulya" || k === "aida" || k === "stf021") return "Luliya";
    if (k === "javier" || k === "javiermarquez" || k === "stf010") return "Javier";
    if (
      k === "javi" ||
      k === "javiarranz" ||
      k === "javiarranzescorial" ||
      k === "palankas" ||
      k === "palankasarranz" ||
      k === "palankasarranzescorial" ||
      k === "stf017"
    ) {
      return "Javi Palankas";
    }
    return "";
  };
  let hit = fromKey(norm(raw));
  if (hit) return hit;
  const firstTok = raw.split(/[,/&]|\band\b/i)[0].trim();
  hit = fromKey(norm(firstTok));
  if (hit) return hit;
  const canon = portalCanonicalStaffRosterKey(raw);
  hit = fromKey(norm(canon));
  if (hit) return hit;
  try {
    if (typeof window !== "undefined") {
      const src = window.STAFF_DASHBOARD_SOURCE;
      const prof = src && src.staffProfiles ? src.staffProfiles[canon] : null;
      const sn = prof && String(prof.staffName || "").trim();
      if (sn) {
        hit = fromKey(norm(sn));
        if (hit) return hit;
        if (sn.includes(" ")) return sn;
      }
    }
  } catch (_) {}
  const label = firstTok || raw;
  if (/^[A-Z]{2,}$/.test(label)) return label.charAt(0) + label.slice(1).toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/**
 * Maps auth.users.email to a stable staff key for redirects.
 *
 * @param {string | null | undefined} authEmail
 * @returns {string}
 */
export function resolveStaffKeyFromAuthEmail(authEmail) {
  const e = resolveCorporateAuthEmail(authEmail);
  if (!e) return "";
  if (PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[e]) {
    return portalCanonicalStaffRosterKey(PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[e]);
  }
  const local = e.split("@")[0] || "";
  if (local && PORTAL_STAFF_CODE_TO_ROSTER_KEY[local]) {
    return PORTAL_STAFF_CODE_TO_ROSTER_KEY[local];
  }
  for (const [name, email] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    if (resolveCorporateAuthEmail(email) === e) {
      return portalCanonicalStaffRosterKey(name);
    }
  }
  return "";
}
