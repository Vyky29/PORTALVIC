/**
 * Canonical portal_session_key normalization (write-time + read-time).
 */

const CLIENT_SLUG_CANON = {
  adam_pi: "adam_p",
  adam_p: "adam_p",
  aadam_ah: "adaam_ah",
  adaam_ah: "adaam_ah",
  abodi_p: "abodi_pa",
  abodi_pa: "abodi_pa",
  abodi: "abodi_pa",
  amar_rai: "amar_ra",
  amar_ra: "amar_ra",
  sammer: "samer",
  samer: "samer",
  rayan_tapa: "rayan_ta",
  rayan_ta: "rayan_ta",
  steven_ces: "steven",
  steven_c: "steven",
  steven_ce: "steven",
  steven: "steven",
  yusuf: "yusuf_ah",
  yusef: "yusuf_ah",
  yusuf_ah: "yusuf_ah",
  eddie_mc: "eddie",
  eddie: "eddie",
  adam_a: "adam_ab",
  adam_ab: "adam_ab",
  junaid: "junaid_f",
  junaid_f: "junaid_f",
  khalid_ab: "khalid",
  khalid: "khalid",
  rayyan_fi: "rayyan_f",
  rayyan_f: "rayyan_f",
  chaitanya_trial_28_06: "chaitanya",
  chaitanya: "chaitanya",
};

const NON_CLIENT_TOKENS = {
  merge: 1,
  wall: 1,
  aquatic: 1,
  day_centre: 1,
  bespoke_shared: 1,
  hub_room: 1,
  teaching_pool: 1,
  big_pool: 1,
  small_pool: 1,
  climbing: 1,
  climbing_wall: 1,
  multi_activity: 1,
  "multi-activity": 1,
  bespoke: 1,
  room_2: 1,
  lane_de: 1,
  lane_se: 1,
};

function clean(v) {
  return String(v == null ? "" : v).trim();
}

export function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalClientSlug(slug) {
  const s = slugify(slug);
  if (!s) return "";
  return CLIENT_SLUG_CANON[s] || s;
}

function weekdayLongFromIso(iso) {
  const d = clean(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  } catch (_e) {
    return "";
  }
}

function hourTo24(hour, dayWord) {
  const h = parseInt(hour, 10);
  if (!Number.isFinite(h)) return hour;
  if (dayWord !== "Sunday" && h < 8) return h + 12;
  if (dayWord === "Sunday" && h >= 1 && h <= 7) return h + 12;
  return h;
}

/** HH:MM from roster dot/colon tokens (matches admin hub normTimeKey). */
export function normTimeKey(token, dayWord) {
  const s = clean(token).toLowerCase().replace(/\s+/g, " ");
  if (!s) return "";
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) {
    return `${String(parseInt(hm[1], 10)).padStart(2, "0")}:${String(parseInt(hm[2], 10) || 0).padStart(2, "0")}`;
  }
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (dot) {
    let dh = parseInt(dot[1], 10);
    const dm = parseInt(dot[2], 10) || 0;
    if (dayWord) dh = hourTo24(dh, dayWord);
    else if (dh >= 1 && dh <= 7) dh += 12;
    return `${String(dh).padStart(2, "0")}:${String(dm).padStart(2, "0")}`;
  }
  return "";
}

function tokenLooksLikeTime(token) {
  const s = clean(token).toLowerCase();
  if (!s) return false;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) return true;
  if (/^\d{1,2}\.\d{1,2}$/.test(s)) return true;
  return false;
}

function normalizePipeToken(token, dayWord) {
  if (token === "") return "";
  const trimmed = clean(token);
  if (tokenLooksLikeTime(trimmed)) {
    return normTimeKey(trimmed, dayWord) || trimmed;
  }
  const slug = slugify(trimmed);
  if (!slug) return trimmed.toLowerCase();
  if (NON_CLIENT_TOKENS[slug] || NON_CLIENT_TOKENS[trimmed.toLowerCase()]) {
    return slug;
  }
  return canonicalClientSlug(slug);
}

/** Normalize a full portal_session_key string (preserves empty pipe segments). */
export function normalizePortalSessionKey(key) {
  const raw = clean(key);
  if (!raw) return "";
  const parts = raw.split("|");
  const date = clean(parts[0]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return raw;
  const dayWord = weekdayLongFromIso(date);
  const out = [date];
  for (let i = 1; i < parts.length; i++) {
    out.push(normalizePipeToken(parts[i], dayWord));
  }
  return out.join("|");
}

export function validatePortalSessionKey(key) {
  const normalized = normalizePortalSessionKey(key);
  if (!normalized) return { ok: false, key: "", error: "empty" };
  if (!/^\d{4}-\d{2}-\d{2}(\|[^\|]*)*$/.test(normalized)) {
    return { ok: false, key: normalized, error: "invalid_format" };
  }
  return { ok: true, key: normalized, error: null };
}

const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};
g.PortalSessionKey = {
  normalizePortalSessionKey,
  validatePortalSessionKey,
  normTimeKey,
  canonicalClientSlug,
  slugify,
};
