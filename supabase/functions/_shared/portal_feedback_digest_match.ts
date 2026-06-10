/** Shared roster ↔ feedback completion rules for late-shift admin digest (parity with portal hub). */

export function slugClient(name: string): string {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function rosterClientsMatch(a: string, b: string): boolean {
  const rosterKey = slugClient(a);
  const statusKey = slugClient(b);
  if (!rosterKey || !statusKey) return false;
  if (rosterKey === statusKey) return true;
  if (/_ah$/.test(rosterKey) && /_ah$/.test(statusKey)) return false;
  return rosterKey.includes(statusKey) || statusKey.includes(rosterKey);
}

export function isDayCentreService(service: string): boolean {
  return /day\s*centre|daycentre|day_centre/i.test(String(service || ""));
}

export function isBespokeSharedService(service: string): boolean {
  return /bespoke.*shared|shared.*bespoke|bespoke_shared/i.test(String(service || ""));
}

export function feedbackAttendanceIsAbsent(attendance: unknown): boolean {
  const att = String(attendance != null ? attendance : "")
    .trim()
    .toLowerCase();
  if (!att) return false;
  if (att === "no" || att === "n" || att === "0" || att === "false") return true;
  if (/^(no[\s\-/]|n\/)/.test(att)) return true;
  if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)/.test(att)) {
    return true;
  }
  return false;
}

export function normalizeTimeSlot(value: string): string {
  const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
}

function clientSlugTokensFromPortalSessionKey(key: string): string[] {
  const parts = String(key || "")
    .split("|")
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) continue;
    if (/^\d{1,2}:\d{2}$/.test(p)) continue;
    if (/multi|climb|aquatic|bespoke|day_centre|swim|hub|pool/.test(p)) continue;
    out.push(p);
  }
  return out;
}

export function portalSessionKeyDateIso(key: string): string {
  const parts = String(key || "").split("|").map((p) => p.trim());
  for (const p of parts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  }
  return "";
}

export function portalKeyMatchesRosterClient(
  portalKey: string,
  rosterClientName: string,
): boolean {
  const slugs = clientSlugTokensFromPortalSessionKey(portalKey);
  if (!slugs.length) return false;
  return slugs.some((s) => rosterClientsMatch(rosterClientName, s));
}

export type DigestRosterRow = {
  client_name?: string | null;
  time_slot?: string | null;
  service?: string | null;
  instructors?: string | null;
};

export type DigestFeedbackRow = {
  client_name?: string | null;
  portal_session_key?: string | null;
  attendance?: string | null;
  service?: string | null;
};

export type DigestKeyRow = {
  portal_session_key?: string | null;
  client_name?: string | null;
};

/** Stable slot identity for dedupe + completion lookup. */
export function rosterDigestSlotKey(row: DigestRosterRow, shiftDateIso: string): string {
  const client = slugClient(String(row.client_name || ""));
  const svc = String(row.service || "").trim();
  if (isDayCentreService(svc)) {
    return `dc|${shiftDateIso}|${client}`;
  }
  if (isBespokeSharedService(svc)) {
    return `bs|${shiftDateIso}|${client}`;
  }
  const time = normalizeTimeSlot(String(row.time_slot || ""));
  return `slot|${shiftDateIso}|${client}|${time}|${slugClient(svc)}`;
}

function rosterTimeFromPortalKey(key: string): string {
  const parts = String(key || "").split("|").map((p) => p.trim());
  for (const p of parts) {
    const t = normalizeTimeSlot(p);
    if (t) return t;
  }
  return "";
}

function feedbackCoversRosterSlot(
  fb: DigestFeedbackRow,
  roster: DigestRosterRow,
  shiftDateIso: string,
): boolean {
  const rosterClient = String(roster.client_name || "").trim();
  if (!rosterClient) return false;
  const pk = String(fb.portal_session_key || "").trim();
  if (pk) {
    const pkDate = portalSessionKeyDateIso(pk);
    if (pkDate && pkDate !== shiftDateIso) return false;
    if (!portalKeyMatchesRosterClient(pk, rosterClient)) return false;
    const rosterTime = normalizeTimeSlot(String(roster.time_slot || ""));
    const pkTime = rosterTimeFromPortalKey(pk);
    if (pkTime && rosterTime && pkTime !== rosterTime) {
      if (!isDayCentreService(String(roster.service || ""))) return false;
    }
    return true;
  }
  const fbClient = String(fb.client_name || "").trim();
  if (!fbClient || !rosterClientsMatch(rosterClient, fbClient)) return false;
  if (isDayCentreService(String(roster.service || ""))) {
    return isDayCentreService(String(fb.service || "")) || !String(fb.service || "").trim();
  }
  return true;
}

function keyRowCoversRosterSlot(
  row: DigestKeyRow,
  roster: DigestRosterRow,
  shiftDateIso: string,
): boolean {
  const pk = String(row.portal_session_key || "").trim();
  if (pk) {
    const pkDate = portalSessionKeyDateIso(pk);
    if (pkDate && pkDate !== shiftDateIso) return false;
    return portalKeyMatchesRosterClient(pk, String(roster.client_name || ""));
  }
  const name = String(row.client_name || "").trim();
  return name ? rosterClientsMatch(String(roster.client_name || ""), name) : false;
}

export function rosterSlotIsComplete(
  roster: DigestRosterRow,
  shiftDateIso: string,
  ctx: {
    feedbackRows: DigestFeedbackRow[];
    cancelRows: DigestKeyRow[];
    absentMarks: DigestKeyRow[];
    feedbackDoneMarks: DigestKeyRow[];
  },
): boolean {
  const client = String(roster.client_name || "").trim();
  if (!client || /^closed$/i.test(client)) return true;

  for (const c of ctx.cancelRows) {
    if (keyRowCoversRosterSlot(c, roster, shiftDateIso)) return true;
  }
  for (const m of ctx.absentMarks) {
    if (keyRowCoversRosterSlot(m, roster, shiftDateIso)) return true;
  }
  for (const m of ctx.feedbackDoneMarks) {
    if (keyRowCoversRosterSlot(m, roster, shiftDateIso)) return true;
  }
  for (const fb of ctx.feedbackRows) {
    if (!feedbackCoversRosterSlot(fb, roster, shiftDateIso)) continue;
    return true;
  }
  return false;
}

export function missingFeedbackClientsForShift(
  rosterRows: DigestRosterRow[],
  shiftDateIso: string,
  ctx: {
    feedbackRows: DigestFeedbackRow[];
    cancelRows: DigestKeyRow[];
    absentMarks: DigestKeyRow[];
    feedbackDoneMarks: DigestKeyRow[];
  },
): string[] {
  const seenSlots = new Set<string>();
  const missing: string[] = [];
  const missingNames = new Set<string>();

  for (const r of rosterRows) {
    const client = String(r.client_name || "").trim();
    if (!client || /^closed$/i.test(client)) continue;
    const slotKey = rosterDigestSlotKey(r, shiftDateIso);
    if (seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    if (rosterSlotIsComplete(r, shiftDateIso, ctx)) continue;
    if (!missingNames.has(client)) {
      missingNames.add(client);
      missing.push(client);
    }
  }
  return missing;
}
