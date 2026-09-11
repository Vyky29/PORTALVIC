/**
 * Canonical staff_id / roster key for Parent Team, Overview, and Staff.
 * Keep in sync with working_ui/portal/portal_staff_match_key.js
 *
 * Never collapse javi ↔ javier (different people).
 */

const STAFF_CODE_TO_KEY: Record<string, string> = {
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
  stf016: "simon",
  stf017: "javi",
  stf018: "raul",
  stf019: "sevitha",
  stf020: "teflon",
  stf021: "luliya",
  stf022: "andres",
};

function stripDiacritics(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Join alnum only — used for compound aliases. */
export function staffJoinedKey(raw: unknown): string {
  return stripDiacritics(String(raw ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve any staff id / username / display name fragment → roster staff_id.
 * Prefer passing covering_staff_id / anchor_staff_id (already a roster key).
 */
export function canonicalStaffMatchKey(value: unknown): string {
  const raw = stripDiacritics(String(value ?? "")).toLowerCase().trim();
  if (!raw) return "";

  const joined = raw.replace(/[^a-z0-9]+/g, "");
  if (STAFF_CODE_TO_KEY[joined]) return STAFF_CODE_TO_KEY[joined];

  /* Surname-aware before first-token (Javi Palankas vs Javier Marquez). */
  if (/palankas|arranz/.test(raw) || joined.includes("palankas") || joined.includes("javiarranz")) {
    return "javi";
  }
  if (/marquez/.test(raw) || joined === "javiermarquez") return "javier";

  if (
    joined === "lulia" ||
    joined === "luliya" ||
    joined === "lulya" ||
    joined === "aida" ||
    joined === "aidalulia" ||
    joined === "aidaluliya" ||
    joined === "aidaluliyajemal"
  ) {
    return "luliya";
  }
  if (joined === "yousef" || joined === "yusef" || joined === "yousseff" || joined === "josep") {
    return "youssef";
  }
  if (joined === "auroragarcia") return "aurora";
  if (
    joined === "emmanuel" ||
    joined === "emmanuelamoakohene" ||
    joined === "nanaamoakohene745"
  ) {
    return "emmanuel";
  }
  /* Client Emanuel Dodson is not staff — but auth typos for staff Emmanuel map above. */
  if (joined === "emanuel") return "emmanuel";
    if (joined.indexOf("michelle") === 0) return "michelle";

    if (joined === "coverneeded" || joined === "coverneed" || joined === "tbc" || joined === "tba") {
      return joined === "tbc" || joined === "tba" ? joined : "coverneeded";
    }

    var first = raw.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0] || "";
    if (!first) return "";
    if (STAFF_CODE_TO_KEY[first]) return STAFF_CODE_TO_KEY[first];
    if (first === "lulia" || first === "lulya" || first === "aida") return "luliya";
    if (first === "yousef" || first === "yusef") return "youssef";
    /* Do NOT map javi → javier. */
    return first;
  }

/** Empty / COVER NEEDED / TBC — not a real staff_id. */
export function isBlankOrCoverNeededStaffId(value: unknown): boolean {
  const k = canonicalStaffMatchKey(value);
  if (!k) return true;
  return (
    k === "coverneeded" ||
    k === "tbc" ||
    k === "tba" ||
    k === "open" ||
    k === "vacant" ||
    k === "unassigned" ||
    k === "extra"
  );
}

export function staffIdsMatch(a: unknown, b: unknown): boolean {
  const ca = canonicalStaffMatchKey(a);
  const cb = canonicalStaffMatchKey(b);
  return !!ca && !!cb && ca === cb;
}
