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
  const s = String(service || "");
  if (/bespoke.*shared|shared.*bespoke|bespoke_shared/i.test(s)) return true;
  /* Hub Tinashe-style books store service as "Bespoke Programme" + key |bespoke_shared. */
  return /bespoke\s*programme/i.test(s);
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
  service?: string | null;
  session_time?: string | null;
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

function digestServiceFits(rosterService: string, reportService: string): boolean {
  const a = String(rosterService || "");
  const b = String(reportService || "");
  if (!b.trim()) return true;
  const aDc = isDayCentreService(a);
  const bDc = isDayCentreService(b);
  if (aDc || bDc) return aDc && bDc;
  const aAq = /aquatic|swim/i.test(a);
  const bAq = /aquatic|swim/i.test(b);
  if (aAq || bAq) return aAq && bAq;
  return true;
}

function digestKeyAgreesWithService(key: string, service: string): boolean {
  const k = String(key || "").toLowerCase();
  const svc = String(service || "").trim();
  if (!k || !svc) return true;
  const keyDc = /day_centre/.test(k);
  const keyAq = /aquatic|swim/.test(k);
  if (/aquatic|swim/i.test(svc) && keyDc && !keyAq) return false;
  if (isDayCentreService(svc) && keyAq && !keyDc) return false;
  return true;
}

function keyRowCoversRosterSlot(
  row: DigestKeyRow,
  roster: DigestRosterRow,
  shiftDateIso: string,
): boolean {
  const pk = String(row.portal_session_key || "").trim();
  const svc = String(row.service || "").trim();
  const keyAgrees = digestKeyAgreesWithService(pk, svc);
  if (pk && keyAgrees) {
    const pkDate = portalSessionKeyDateIso(pk);
    if (pkDate && pkDate !== shiftDateIso) return false;
    return portalKeyMatchesRosterClient(pk, String(roster.client_name || ""));
  }
  if (pk && !keyAgrees) {
    const pkDate = portalSessionKeyDateIso(pk);
    if (pkDate && pkDate !== shiftDateIso) return false;
  }
  const name = String(row.client_name || "").trim();
  if (!name || !rosterClientsMatch(String(roster.client_name || ""), name)) return false;
  if (pk && !keyAgrees) {
    if (!svc || !digestServiceFits(String(roster.service || ""), svc)) return false;
    return true;
  }
  return true;
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

function digestClientOwesFeedback(name: string): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  /* Open seats and duty labels are not a child. Never list them as missing feedback. */
  const skip =
    /^(home|manager|closed|available|no[_\s]*participant|no[_\s]*client|open|cover[_\s]*needed|off|day[_\s]*off|casa|na|office|interview|interviews|admin|ops|operations|shadowing|training|meeting|team[_\s]*meeting|hold[_\s]?waitlist|waitlist|waiting[_\s]?list|waiting|elia)$/i;
  const parts = n.split(/\s*[·•|]\s*/).map((p) => String(p || "").trim()).filter(Boolean);
  for (const part of parts.length ? parts : [n]) {
    if (skip.test(part)) return false;
    if (skip.test(slugClient(part).replace(/_/g, " "))) return false;
  }
  return true;
}

export type DigestAbsenceOverride = {
  override_type?: string | null;
  status?: string | null;
  anchor_client_id?: string | null;
  anchor_time_slot_label?: string | null;
  payload?: Record<string, unknown> | null;
};

/** 5.30 and 17.30 are the same afternoon seat. Morning hours stay as written. */
function digestStartMinutes(label: string): number | null {
  const s = String(label || "").trim().toLowerCase().replace(/\./g, ":");
  const m = s.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || "0");
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h >= 1 && h <= 7) h += 12;
  return h * 60 + min;
}

function digestTimesSameSeat(a: string, b: string): boolean {
  const aa = digestStartMinutes(a);
  const bb = digestStartMinutes(b);
  if (aa == null || bb == null) return true;
  return Math.abs(aa - bb) <= 20;
}

/** Absence and admin cancel live on schedule_overrides, not on the quick-mark table. */
export function digestOverrideClearsRosterSlot(
  roster: DigestRosterRow,
  ov: DigestAbsenceOverride,
): boolean {
  const st = String(ov.status || "active").trim().toLowerCase();
  if (st && st !== "active") return false;
  const ot = String(ov.override_type || "").trim();
  const pl = ov.payload && typeof ov.payload === "object" ? ov.payload : {};
  const feedbackRes = String(pl.feedback_resolution || "").trim().toLowerCase();
  const clears =
    ot === "client_absence_announced" ||
    ot === "slot_close" ||
    ot === "client_cancelled" ||
    feedbackRes === "absent" ||
    feedbackRes === "cancelled" ||
    (ot === "slot_clear_client" &&
      !!pl.cancelled_by_admin &&
      pl.day_reassign !== true &&
      pl.not_makeup !== true);
  if (!clears) return false;
  const client = String(roster.client_name || "");
  const anchor = String(ov.anchor_client_id || "").trim();
  const key = String(pl.portal_session_key || "").trim();
  const clientHit =
    (anchor && rosterClientsMatch(client, anchor)) ||
    (key && portalKeyMatchesRosterClient(key, client));
  if (!clientHit) return false;
  const timeLab = String(ov.anchor_time_slot_label || "").trim();
  if (!timeLab) return true;
  return digestTimesSameSeat(String(roster.time_slot || ""), timeLab);
}

export function missingFeedbackClientsForShift(
  rosterRows: DigestRosterRow[],
  shiftDateIso: string,
  ctx: {
    feedbackRows: DigestFeedbackRow[];
    cancelRows: DigestKeyRow[];
    absentMarks: DigestKeyRow[];
    feedbackDoneMarks: DigestKeyRow[];
    absenceOverrides?: DigestAbsenceOverride[];
  },
): string[] {
  const seenSlots = new Set<string>();
  const missing: string[] = [];
  const missingNames = new Set<string>();
  const overrides = ctx.absenceOverrides || [];

  for (const r of rosterRows) {
    const client = String(r.client_name || "").trim();
    if (!client || !digestClientOwesFeedback(client)) continue;
    const slotKey = rosterDigestSlotKey(r, shiftDateIso);
    if (seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    if (overrides.some((ov) => digestOverrideClearsRosterSlot(r, ov))) continue;
    if (rosterSlotIsComplete(r, shiftDateIso, ctx)) continue;
    if (!missingNames.has(client)) {
      missingNames.add(client);
      missing.push(client);
    }
  }
  return missing;
}
