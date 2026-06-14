/**
 * Browser Supabase client (Supabase JS v2, ESM CDN — browser-safe).
 * Uses window.SUPABASE_URL and window.SUPABASE_ANON_KEY when set.
 * Optional: DEFAULT_* below if you cannot inject globals.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://cklpnwhlqsulpmkipmqb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE";

const STORAGE_KEY = "portal_staff_context";
/** Last seen `staff_profiles.auth_session_generation` (localStorage — shared across portal tabs). */
const PORTAL_AUTH_GEN_SESSION_KEY = "portalAuthSessionGenV1";

/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let _client = null;

function readConfig() {
  const w = typeof window !== "undefined" ? window : undefined;
  const url = String((w && w.SUPABASE_URL) || DEFAULT_SUPABASE_URL || "").trim();
  const key = String((w && w.SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY || "").trim();
  return { url, key };
}

/** Project API URL without trailing slash (for REST, Functions, Realtime). */
export function getSupabaseUrl() {
  const { url } = readConfig();
  return url.replace(/\/$/, "");
}

/** Edge Function invoke URL, e.g. `https://xxx.supabase.co/functions/v1/portal-push-subscribe`. */
export function getSupabaseFunctionUrl(functionName) {
  const base = getSupabaseUrl();
  const slug = String(functionName || "").trim().replace(/^\/+/, "");
  if (!base || !slug) return "";
  return `${base}/functions/v1/${slug}`;
}

/** Anon key for `apikey` header when calling Edge Functions from the browser. */
export function getSupabaseAnonKey() {
  const { key } = readConfig();
  return key;
}

/** @returns {boolean} */
export function isSupabaseConfigured() {
  const { url, key } = readConfig();
  return Boolean(url && key);
}

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function getSupabaseClient() {
  if (_client) return _client;
  const { url, key } = readConfig();
  if (!url || !key) {
    throw new Error(
      "Missing Supabase config: set window.SUPABASE_URL and window.SUPABASE_ANON_KEY before loading this module, or fill DEFAULT_* in database/supabase-client.js."
    );
  }
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}

/**
 * Prefer the dashboard singleton from auth bootstrap (avoids duplicate GoTrueClient).
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function getSharedSupabaseClient() {
  const w = typeof window !== "undefined" ? window : undefined;
  const shared = w && w.__PORTAL_SUPABASE__ && w.__PORTAL_SUPABASE__.client;
  if (shared) return shared;
  return getSupabaseClient();
}

/**
 * @param {{ app_role?: string | null, staff_role?: string | null }} profileRow
 * @param {string} userId
 */
export function setPortalStaffContext(profileRow, userId) {
  const ctx = {
    user_id: userId,
    app_role: profileRow?.app_role ?? null,
    staff_role: profileRow?.staff_role ?? null,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

/** @returns {{ user_id: string, app_role: string | null, staff_role: string | null } | null} */
export function getPortalStaffContext() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPortalStaffContext() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function portalGetCachedAuthSessionGeneration() {
  try {
    const raw = localStorage.getItem(PORTAL_AUTH_GEN_SESSION_KEY);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function portalSetCachedAuthSessionGeneration(n) {
  try {
    localStorage.setItem(PORTAL_AUTH_GEN_SESSION_KEY, String(Number(n) || 0));
  } catch {
    /* ignore */
  }
}

export function portalClearCachedAuthSessionGeneration() {
  try {
    localStorage.removeItem(PORTAL_AUTH_GEN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Call once after each successful password login. Other devices/tabs polling
 * `staff_profiles.auth_session_generation` will see a higher value and sign out.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function portalBumpAuthSessionGeneration(supabase) {
  const { data, error } = await supabase.rpc("portal_bump_auth_session_generation");
  if (error) throw error;
  const v = typeof data === "number" ? data : Number(data);
  if (Number.isFinite(v)) portalSetCachedAuthSessionGeneration(v);
  return v;
}

/**
 * Bespoke SwimFarm trio (Tinashe): submitted rows often use `YYYY-MM-DD||client` while roster
 * review keys use `YYYY-MM-DD|client|bespoke_shared` — expand so co-instructor Supabase fetch hits both.
 * @param {string[]} rosterSessionKeys
 * @returns {string[]}
 */
export function portalExpandRosterKeysForSharedFeedbackLookup(rosterSessionKeys) {
  const out = new Set();
  for (const raw of rosterSessionKeys || []) {
    const rk = String(raw || "").trim();
    if (!rk) continue;
    out.add(rk);
    const parts = rk.split("|");
    const date = String(parts[0] || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const last = String(parts[parts.length - 1] || "")
      .trim()
      .toLowerCase();
    if (last === "bespoke_shared" && parts.length >= 2) {
      const client = String(parts[1] || "").trim().toLowerCase();
      if (client) {
        out.add(`${date}||${client}`);
        out.add(`${date}||${client}|hub_room`);
      }
      continue;
    }
    if (last === "day_centre" && parts.length >= 2) {
      const client = String(parts[1] || "").trim().toLowerCase();
      if (client) {
        out.add(`${date}||${client}`);
      }
      continue;
    }
    if (parts.length >= 3 && parts[1] === "") {
      const client = String(parts[2] || "").trim().toLowerCase();
      if (client) {
        out.add(`${date}||${client}`);
        out.add(`${date}|${client}|bespoke_shared`);
      }
    }
  }
  return [...out];
}

/**
 * Unique YYYY-MM-DD values from roster session keys (term historical peer sync).
 * @param {string[]} rosterSessionKeys
 * @returns {string[]}
 */
export function portalExtractDatesFromRosterKeys(rosterSessionKeys) {
  const dates = new Set();
  for (const raw of rosterSessionKeys || []) {
    const d = String(raw || "").trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.add(d);
  }
  return [...dates].sort();
}

/**
 * Session keys with server-side submissions in the last ~150 days (full term horizon).
 * Feedback: own rows plus, when `opts.rosterSessionKeys` is set, any submission for those
 * `portal_session_key` values (co-instructors on the same slot share one key).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {{ rosterSessionKeys?: string[], catchUpSessionDates?: string[], feedbackMergeRules?: unknown[] }} [opts]
 * @returns {Promise<{ feedbackKeys: string[], incidentKeys: string[], cancellationKeys: string[], absentKeys: string[], quickFeedbackDoneKeys: string[] }>}
 */
export async function portalFetchSubmittedReviewSessionKeys(supabase, userId, opts = {}) {
  const empty = {
    feedbackKeys: [],
    absentFeedbackKeys: [],
    incidentKeys: [],
    cancellationKeys: [],
    absentKeys: [],
    quickFeedbackDoneKeys: [],
  };
  if (!supabase || !userId) return empty;
  const since = new Date();
  since.setDate(since.getDate() - 150);
  const sinceStr = since.toISOString().slice(0, 10);

  const rawRoster = opts && Array.isArray(opts.rosterSessionKeys) ? opts.rosterSessionKeys : [];
  const rosterSessionKeys = portalExpandRosterKeysForSharedFeedbackLookup(
    [...new Set(rawRoster.map((k) => String(k || "").trim()).filter(Boolean))]
  ).slice(0, 400);
  const catchUpDates = (
    opts && Array.isArray(opts.catchUpSessionDates) ? opts.catchUpSessionDates : []
  )
    .map((d) => String(d || "").trim().slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const peerSessionDates = [
    ...new Set([...catchUpDates, ...portalExtractDatesFromRosterKeys(rosterSessionKeys)]),
  ].slice(0, 90);

  const [fb, inc, can, fbPeerShared, fbSharedRpc, quickMarks, fbCatchUp] = await Promise.all([
    supabase
      .from("session_feedback")
      .select("portal_session_key, attendance, client_name, session_date, service, completed_by_name")
      .eq("submitted_by_user_id", userId)
      .not("portal_session_key", "is", null)
      .gte("session_date", sinceStr),
    supabase
      .from("incident_reports")
      .select("portal_session_key")
      .eq("submitted_by_user_id", userId)
      .not("portal_session_key", "is", null)
      .gte("session_date", sinceStr),
    supabase
      .from("cancellation_reports")
      .select("portal_session_key")
      .eq("submitted_by_user_id", userId)
      .not("portal_session_key", "is", null)
      .gte("session_date", sinceStr),
    rosterSessionKeys.length && peerSessionDates.length
      ? supabase
          .from("session_feedback")
          .select("portal_session_key, attendance, client_name, session_date, service, completed_by_name")
          .in("session_date", peerSessionDates)
          .not("portal_session_key", "is", null)
      : rosterSessionKeys.length
        ? supabase
            .from("session_feedback")
            .select("portal_session_key, attendance, client_name, session_date, service, completed_by_name")
            .gte("session_date", sinceStr)
            .not("portal_session_key", "is", null)
        : Promise.resolve({ data: null, error: null }),
    rosterSessionKeys.length
      ? supabase.rpc("portal_feedback_submitted_keys_for_sessions", {
          p_keys: rosterSessionKeys,
        })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("portal_staff_session_quick_marks")
      .select("portal_session_key, mark_type")
      .eq("staff_user_id", userId)
      .gte("session_date", sinceStr)
      .in("mark_type", ["absent", "feedback_done"]),
    catchUpDates.length
      ? supabase
          .from("session_feedback")
          .select("portal_session_key, attendance, client_name, session_date, service, completed_by_name")
          .eq("submitted_by_user_id", userId)
          .not("portal_session_key", "is", null)
          .in("session_date", catchUpDates)
      : Promise.resolve({ data: null, error: null }),
  ]);

  function portalFeedbackAttendanceIsAbsent(attendance) {
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

  /** @param {unknown} rows */
  function partitionFeedbackRows(rows) {
    const present = [];
    const absent = [];
    const seenP = new Set();
    const seenA = new Set();
    if (!Array.isArray(rows)) return { present, absent };
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const k = String(/** @type {{ portal_session_key?: string }} */ (r).portal_session_key || "").trim();
      if (!k) continue;
      if (portalFeedbackAttendanceIsAbsent(/** @type {{ attendance?: string }} */ (r).attendance)) {
        if (!seenA.has(k)) {
          seenA.add(k);
          absent.push(k);
        }
      } else if (!seenP.has(k)) {
        seenP.add(k);
        present.push(k);
      }
    }
    return { present, absent };
  }

  /** @param {unknown} rows */
  function dedupeKeys(rows) {
    if (!Array.isArray(rows)) return [];
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const k = String(/** @type {{ portal_session_key?: string }} */ (r).portal_session_key || "").trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }

  /** @param {unknown} rpcData */
  function feedbackKeysFromSharedRpc(rpcData) {
    if (!rpcData) return [];
    if (Array.isArray(rpcData) && rpcData.length && typeof rpcData[0] === "string") {
      const out = [];
      const seen = new Set();
      for (const x of rpcData) {
        const k = String(x || "").trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
      return out;
    }
    return dedupeKeys(rpcData);
  }

  const ownParts = partitionFeedbackRows(fb.data);
  const catchUpParts = partitionFeedbackRows(fbCatchUp && !fbCatchUp.error ? fbCatchUp.data : null);

  /** Co-instructor: match peer-visible session_feedback rows onto roster keys (flexible key shapes). */
  function matchCoInstructorFeedbackToRosterKeys(peerRows) {
    const present = [];
    const absent = [];
    const seenP = new Set();
    const seenA = new Set();
    const matchOpts = {
      feedbackMergeRules:
        opts && Array.isArray(opts.feedbackMergeRules) ? opts.feedbackMergeRules : [],
    };
    if (!Array.isArray(peerRows)) return { present, absent };
    for (const r of peerRows) {
      if (!r || typeof r !== "object") continue;
      const pk = String(
        /** @type {{ portal_session_key?: string }} */ (r).portal_session_key || ""
      ).trim();
      if (!pk) continue;
      const isAbs = portalFeedbackAttendanceIsAbsent(
        /** @type {{ attendance?: string }} */ (r).attendance
      );
      for (const rk of rosterSessionKeys) {
        if (!portalFeedbackSubmittedKeyMatchesRosterKey(pk, rk, matchOpts)) continue;
        if (isAbs) {
          if (!seenA.has(rk)) {
            seenA.add(rk);
            absent.push(rk);
          }
        } else if (!seenP.has(rk)) {
          seenP.add(rk);
          present.push(rk);
        }
        break;
      }
    }
    return { present, absent };
  }

  const peerParts =
    fbPeerShared && !fbPeerShared.error
      ? matchCoInstructorFeedbackToRosterKeys(fbPeerShared.data)
      : { present: [], absent: [] };
  if (fbPeerShared && fbPeerShared.error) {
    console.warn("[portal] co-instructor session_feedback peer read skipped", fbPeerShared.error);
  }

  const rpcKeys =
    fbSharedRpc && !fbSharedRpc.error ? feedbackKeysFromSharedRpc(fbSharedRpc.data) : [];
  if (fbSharedRpc && fbSharedRpc.error) {
    console.warn("[portal] portal_feedback_submitted_keys_for_sessions skipped", fbSharedRpc.error);
  }
  const rpcPresent = [];
  for (const rk of rpcKeys) {
    const rks = String(rk || "").trim();
    if (!rks || peerParts.present.includes(rks) || peerParts.absent.includes(rks)) continue;
    rpcPresent.push(rks);
  }

  const exactSharedParts = {
    present: [...new Set([...peerParts.present, ...rpcPresent])],
    absent: peerParts.absent,
  };

  const absentFeedbackKeys = [
    ...new Set([...ownParts.absent, ...catchUpParts.absent, ...exactSharedParts.absent]),
  ];
  const feedbackMerged = [
    ...new Set([
      ...ownParts.present,
      ...catchUpParts.present,
      ...exactSharedParts.present,
      ...absentFeedbackKeys,
    ]),
  ];

  /** @type {string[]} */
  const absentKeys = [];
  /** @type {string[]} */
  const quickFeedbackDoneKeys = [];
  if (quickMarks && quickMarks.error) {
    console.warn("[portal] portal_staff_session_quick_marks fetch skipped", quickMarks.error);
  }
  const qmRows = quickMarks && !quickMarks.error && Array.isArray(quickMarks.data) ? quickMarks.data : [];
  const seenAbs = new Set();
  const seenQfd = new Set();
  for (const r of qmRows) {
    if (!r || typeof r !== "object") continue;
    const k = String(/** @type {{ portal_session_key?: string }} */ (r).portal_session_key || "").trim();
    const mt = String(/** @type {{ mark_type?: string }} */ (r).mark_type || "").trim();
    if (!k) continue;
    if (mt === "absent" && !seenAbs.has(k)) {
      seenAbs.add(k);
      absentKeys.push(k);
    } else if (mt === "feedback_done" && !seenQfd.has(k)) {
      seenQfd.add(k);
      quickFeedbackDoneKeys.push(k);
    }
  }

  portalHydrateLiveSessionFeedbackCache([
    fb.data,
    fbCatchUp && !fbCatchUp.error ? fbCatchUp.data : null,
    fbPeerShared && !fbPeerShared.error ? fbPeerShared.data : null,
  ]);

  return {
    feedbackKeys: feedbackMerged,
    absentFeedbackKeys,
    incidentKeys: dedupeKeys(inc.data),
    cancellationKeys: dedupeKeys(can.data),
    absentKeys,
    quickFeedbackDoneKeys,
  };
}

function portalMapDbFeedbackRowToLiveCache(r) {
  if (!r || typeof r !== "object") return null;
  const pk = String(r.portal_session_key || "").trim();
  const date = String(r.session_date || "").trim().slice(0, 10);
  if (!pk || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    clientName: r.client_name,
    date,
    service: r.service,
    attendance: r.attendance,
    instructor: r.completed_by_name,
    portalSessionKey: pk,
    portal_session_key: pk,
    _live: true,
  };
}

/** Populate window cache so staff bridge uses Supabase rows for days after static export coverage. */
function portalHydrateLiveSessionFeedbackCache(dbRowBatches) {
  if (typeof window === "undefined") return;
  const liveRows = [];
  const seen = new Set();
  for (const batch of dbRowBatches) {
    if (!Array.isArray(batch)) continue;
    for (const raw of batch) {
      const row = portalMapDbFeedbackRowToLiveCache(raw);
      if (!row) continue;
      const dedupe = row.portalSessionKey + "|" + row.date;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      liveRows.push(row);
    }
  }
  window.__PORTAL_LIVE_SESSION_FEEDBACK_ROWS__ = liveRows;
  window.__PORTAL_LIVE_SESSION_FEEDBACK_AT__ = new Date().toISOString();
}

/**
 * Persist dashboard quick actions (absent / “feedback done”) for cross-device sync.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ staff_user_id: string, portal_session_key: string, session_date: string, mark_type: "absent" | "feedback_done" }} row
 */
export async function portalUpsertStaffSessionQuickMark(supabase, row) {
  if (!supabase || !row) throw new Error("portalUpsertStaffSessionQuickMark: missing supabase or row");
  const staff_user_id = String(row.staff_user_id || "").trim();
  const portal_session_key = String(row.portal_session_key || "").trim();
  const session_date = String(row.session_date || "").trim();
  const mark_type = String(row.mark_type || "").trim();
  if (!staff_user_id || !portal_session_key || !session_date || !mark_type) {
    throw new Error("portalUpsertStaffSessionQuickMark: invalid row");
  }
  const payload = { staff_user_id, portal_session_key, session_date, mark_type };
  const { error } = await supabase.from("portal_staff_session_quick_marks").upsert(payload, {
    onConflict: "staff_user_id,portal_session_key,mark_type",
  });
  if (error) throw error;
}

/** Client slug tokens from portal_session_key (skip date, time, empty). */
function clientSlugTokensFromPortalSessionKey(key) {
  const parts = String(key || "")
    .split("|")
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) continue;
    if (/^\d{1,2}:\d{2}$/.test(p)) continue;
    out.push(p);
  }
  return out;
}

/** Known client_id / slug aliases (roster spreadsheet vs ClassForKids). */
function portalCanonicalClientSlugToken(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "amar_rai") return "amar_ra";
  return s;
}

/** Strict client slug match — never treat "amar" as matching "amber". */
export function portalClientSlugTokensEquivalent(a, b) {
  const rs = portalCanonicalClientSlugToken(a);
  const ss = portalCanonicalClientSlugToken(b);
  if (!rs || !ss) return false;
  if (rs === ss) return true;
  if (/_ah$/.test(rs) && /_ah$/.test(ss) && rs !== ss) return false;
  if (rs.startsWith(`${ss}_`) || ss.startsWith(`${rs}_`)) return true;
  return false;
}

/** Service / area tokens in portal_session_key — not participant slugs. */
function portalFeedbackNonParticipantSlugToken(token) {
  const s = String(token || "").trim().toLowerCase();
  if (!s) return true;
  if (
    s === "merge" ||
    s === "wall" ||
    s === "aquatic" ||
    s === "day_centre" ||
    s === "bespoke_shared" ||
    s === "hub_room" ||
    s === "teaching_pool" ||
    s === "big_pool" ||
    s === "climbing" ||
    s === "climbing_wall" ||
    s === "multi_activity" ||
    s === "multi-activity"
  ) {
    return true;
  }
  if (/^(multi|climb|swim|bespoke|day_centre)/.test(s)) return true;
  return false;
}

function portalSlugifyFeedbackName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function portalSubmittedKeyIsMergeFeedback(submittedKey) {
  return /^\d{4}-\d{2}-\d{2}\|merge\|/i.test(String(submittedKey || "").trim());
}

function portalSubmittedKeyIsDateClientOnly(submittedKey) {
  const parts = String(submittedKey || "")
    .trim()
    .split("|");
  return parts.length >= 3 && parts[1] === "" && !!parts[2];
}

function portalRosterKeyIsSharedFeedbackUnit(rosterKey) {
  const parts = String(rosterKey || "")
    .trim()
    .split("|");
  const last = String(parts[parts.length - 1] || "")
    .trim()
    .toLowerCase();
  if (last === "day_centre" || last === "bespoke_shared") return true;
  if (parts.length >= 3 && parts[1] === "") return true;
  return false;
}

function portalMergeRuleSlotStartHm(timeSlot) {
  const raw = String(timeSlot || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(?:to|$|-)/);
  if (!m) return "";
  const h = parseInt(m[1], 10);
  const min = m[2] != null ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(h) || h < 0 || h > 23) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function portalFeedbackMergeKeyMatchesRosterKey(submittedKey, rosterKey, mergeRules) {
  const m = String(submittedKey || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})\|merge\|(.+)$/i);
  if (!m) return false;
  const date = m[1];
  const mergeKey = String(m[2] || "").trim();
  const r = String(rosterKey || "").trim();
  if (r === String(submittedKey || "").trim()) return true;
  if (!r.startsWith(`${date}|`)) return false;
  const rules = Array.isArray(mergeRules) ? mergeRules : [];
  const rule = rules.find((x) => String(x && x.mergeKey ? x.mergeKey : "").trim() === mergeKey);
  if (!rule) return false;
  const clientSlug = portalSlugifyFeedbackName(rule.client_name);
  const rSlugs = portalFeedbackParticipantSlugTokensFromKey(r);
  if (!rSlugs.some((rs) => portalClientSlugTokensEquivalent(rs, clientSlug))) return false;
  const rTime = portalSessionKeyTimeToken(r);
  if (!rTime) return true;
  const allowed = new Set();
  for (const slot of rule.slots || []) {
    const hm = portalMergeRuleSlotStartHm(slot && slot.time_slot);
    if (hm) allowed.add(hm);
  }
  return allowed.has(rTime);
}

/** Participant client slug tokens only (excludes aquatic, day_centre, pool area, …). */
function portalFeedbackParticipantSlugTokensFromKey(key) {
  return clientSlugTokensFromPortalSessionKey(key).filter(
    (t) => !portalFeedbackNonParticipantSlugToken(t)
  );
}

function portalSessionKeyClientSlugsMatch(submittedKey, rosterKey) {
  const rSlugs = portalFeedbackParticipantSlugTokensFromKey(rosterKey);
  const sSlugs = portalFeedbackParticipantSlugTokensFromKey(submittedKey);
  if (!rSlugs.length || !sSlugs.length) return false;
  for (const rs of rSlugs) {
    for (const ss of sSlugs) {
      if (portalClientSlugTokensEquivalent(rs, ss)) return true;
    }
  }
  return false;
}

/** Area token from portal_session_key / feedback unit key (hub_room, big_pool, climbing, …). */
function portalSessionKeyAreaToken(key) {
  const parts = String(key || "")
    .split("|")
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean);
  if (parts.length < 4) return "";
  /* date|client|HH:mm|service|area|instructor — trailing token is instructor, not area */
  if (
    parts.length >= 6 &&
    /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) &&
    /^\d{1,2}:\d{2}$/.test(parts[2]) &&
    /multi|climb|aquatic|bespoke|day_centre|swim/.test(parts[3])
  ) {
    return parts[4] || "";
  }
  const last = parts[parts.length - 1];
  if (last === "day_centre") return last;
  if (last === "bespoke_shared") return last;
  if (/^\d{4}-\d{2}-\d{2}$/.test(last) || /^\d{1,2}:\d{2}$/.test(last)) return "";
  if (parts.length >= 5) return last;
  if (/^\d{1,2}:\d{2}$/.test(parts[1])) return last;
  return "";
}

function portalSessionKeyAreaTokensCompatible(submittedKey, rosterKey) {
  const sArea = portalSessionKeyAreaToken(submittedKey);
  const rArea = portalSessionKeyAreaToken(rosterKey);
  if (!sArea && !rArea) return true;
  if (sArea && rArea) {
    if (sArea === rArea) return true;
    if (sArea === "bespoke_shared" || rArea === "bespoke_shared") return true;
    if (sArea === "day_centre" || rArea === "day_centre") return true;
    if (
      (sArea.includes("hub") || sArea === "bespoke_shared") &&
      (rArea.includes("hub") || rArea === "bespoke_shared")
    ) {
      return true;
    }
    if (
      (sArea.includes("climb") || sArea === "climbing" || sArea === "climbing_wall") &&
      (rArea.includes("climb") || rArea === "climbing" || rArea === "climbing_wall")
    ) {
      return true;
    }
    return false;
  }
  if (portalRosterKeyIsSharedFeedbackUnit(rosterKey)) return true;
  if (portalSubmittedKeyIsDateClientOnly(submittedKey) && portalRosterKeyIsSharedFeedbackUnit(rosterKey)) {
    return true;
  }
  return false;
}

function portalSessionKeyTimeToken(key) {
  const parts = String(key || "")
    .split("|")
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
    }
  }
  return "";
}

/**
 * Roster keys use `YYYY-MM-DD|HH:mm|client_id`; Supabase often stores `YYYY-MM-DD||client_slug`.
 * @param {string} submittedKey
 * @param {string} rosterKey
 * @param {{ feedbackMergeRules?: Array<{ mergeKey?: string, client_name?: string, slots?: Array<{ time_slot?: string }> }> }} [opts]
 */
export function portalFeedbackSubmittedKeyMatchesRosterKey(submittedKey, rosterKey, opts = {}) {
  const s = String(submittedKey || "").trim();
  const r = String(rosterKey || "").trim();
  if (!s || !r) return false;
  if (s === r) return true;
  if (portalSubmittedKeyIsMergeFeedback(s)) {
    return portalFeedbackMergeKeyMatchesRosterKey(s, r, opts.feedbackMergeRules);
  }
  const rParts = r.split("|");
  const sParts = s.split("|");
  const rDate = rParts[0];
  const sDate = sParts[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate) || !/^\d{4}-\d{2}-\d{2}$/.test(sDate)) return false;
  if (sDate !== rDate) {
    try {
      const rd = new Date(`${rDate}T12:00:00`).getTime();
      const sd = new Date(`${sDate}T12:00:00`).getTime();
      if (!Number.isFinite(rd) || !Number.isFinite(sd) || sd - rd !== 86400000) return false;
    } catch {
      return false;
    }
  }
  const rTime = portalSessionKeyTimeToken(r);
  const sTime = portalSessionKeyTimeToken(s);
  if (rTime && sTime && sTime !== rTime) return false;
  /* date||client must not absorb a timed submission from another slot the same day. */
  if (sTime && !rTime && rParts[1] === "" && rParts[2] && !rParts[3]) return false;
  /* Untimed submission must not mark another instructor's timed MA / climbing slot green. */
  if (
    portalSubmittedKeyIsDateClientOnly(s) &&
    rTime &&
    !portalRosterKeyIsSharedFeedbackUnit(r)
  ) {
    return false;
  }
  if (rTime && !sTime && !portalRosterKeyIsSharedFeedbackUnit(r)) return false;
  if (!portalSessionKeyAreaTokensCompatible(s, r)) return false;
  /* Participant slugs only — never fall back to raw pipe segment (e.g. "aquatic" on date|amber|aquatic). */
  return portalSessionKeyClientSlugsMatch(s, r);
}

/**
 * Map submitted portal_session_key values onto roster session review keys in memory.
 * @param {Record<string, { feedbackDone?: boolean, incident?: boolean, absent?: boolean, cancelled?: boolean }>} memory
 * @param {string[]} submittedKeys
 * @param {string[]} rosterKeys
 */
export function portalFanOutFeedbackKeysOntoRosterMemory(memory, submittedKeys, rosterKeys, opts = {}) {
  const markAbsent = !!(opts && opts.markAbsent);
  const base = () => ({
    feedbackDone: false,
    incident: false,
    absent: false,
    cancelled: false,
  });
  let changed = false;
  for (const rk of rosterKeys || []) {
    const rosterKey = String(rk || "").trim();
    if (!rosterKey) continue;
    for (const fk of submittedKeys || []) {
      if (!portalFeedbackSubmittedKeyMatchesRosterKey(fk, rosterKey, opts)) continue;
      const prev = memory[rosterKey] || base();
      if (markAbsent) {
        if (!prev.absent) {
          memory[rosterKey] = { ...prev, absent: true, feedbackDone: false };
          changed = true;
        }
      } else if (!prev.absent && !prev.feedbackDone) {
        memory[rosterKey] = { ...prev, feedbackDone: true };
        changed = true;
      }
      break;
    }
  }
  return changed;
}

/**
 * Merge server truth into the dashboard's in-memory review map (same object as localStorage mirror).
 * @param {Record<string, { feedbackDone?: boolean, incident?: boolean, absent?: boolean, cancelled?: boolean }>} memory
 * @param {{ feedbackKeys: string[], absentFeedbackKeys?: string[], incidentKeys: string[], cancellationKeys: string[], absentKeys?: string[], quickFeedbackDoneKeys?: string[] }} packs
 * @param {{ rosterSessionKeys?: string[], feedbackMergeRules?: unknown[] }} [opts]
 */
export function portalMergeReviewKeysIntoMemoryMap(memory, packs, opts = {}) {
  const base = () => ({
    feedbackDone: false,
    incident: false,
    absent: false,
    cancelled: false,
  });
  let changed = false;
  const absentFb = [...new Set(packs.absentFeedbackKeys || [])];
  for (const k of absentFb) {
    const prev = memory[k] || base();
    if (!prev.absent) {
      memory[k] = { ...prev, absent: true, feedbackDone: false };
      changed = true;
    }
  }
  const submittedFb = portalSubmittedFeedbackKeysForMemory(packs);
  for (const k of submittedFb) {
    const prev = memory[k] || base();
    if (prev.absent) continue;
    if (!prev.feedbackDone) {
      memory[k] = { ...prev, feedbackDone: true };
      changed = true;
    }
  }
  for (const k of packs.incidentKeys || []) {
    const prev = memory[k] || base();
    if (!prev.incident) {
      memory[k] = { ...prev, incident: true };
      changed = true;
    }
  }
  for (const k of packs.cancellationKeys || []) {
    const prev = memory[k] || base();
    if (!prev.cancelled) {
      memory[k] = { ...prev, cancelled: true };
      changed = true;
    }
  }
  for (const k of packs.absentKeys || []) {
    const prev = memory[k] || base();
    if (!prev.absent) {
      memory[k] = { ...prev, absent: true, feedbackDone: false };
      changed = true;
    }
  }
  const rosterKeys = Array.isArray(opts.rosterSessionKeys) ? opts.rosterSessionKeys : [];
  if (rosterKeys.length && absentFb.length) {
    if (portalFanOutFeedbackKeysOntoRosterMemory(memory, absentFb, rosterKeys, { markAbsent: true })) {
      changed = true;
    }
  }
  if (rosterKeys.length && submittedFb.length) {
    if (portalFanOutFeedbackKeysOntoRosterMemory(memory, submittedFb, rosterKeys)) {
      changed = true;
    }
  }
  return changed;
}

function portalReviewKeyDateIso(rosterKey) {
  const d = String(rosterKey || "").split("|")[0].trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

/** London calendar date YYYY-MM-DD (staff feedback “today” boundary). */
export function portalLondonTodayIso() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  } catch {
    return "";
  }
}

/** Quick marks count as feedback only before London today; today+ needs session_feedback row. */
function portalSubmittedFeedbackKeysForMemory(packs) {
  const absentFb = [...new Set(packs.absentFeedbackKeys || [])];
  const realFb = [...new Set(packs.feedbackKeys || [])].filter((k) => absentFb.indexOf(k) < 0);
  const today = portalLondonTodayIso();
  const quick = [...new Set(packs.quickFeedbackDoneKeys || [])].filter((k) => {
    if (!today) return true;
    const iso = portalReviewKeyDateIso(k);
    return iso && iso < today;
  });
  return [...new Set([...realFb, ...quick])];
}

function portalReviewMemoryBase() {
  return { feedbackDone: false, incident: false, absent: false, cancelled: false };
}

/**
 * Roster session keys backed by Supabase for staff tablets (fan-out uses strict slug match).
 * @param {string[]} rosterKeys
 * @param {{ feedbackKeys?: string[], absentFeedbackKeys?: string[], incidentKeys?: string[], cancellationKeys?: string[], absentKeys?: string[], quickFeedbackDoneKeys?: string[] }} packs
 * @param {{ feedbackMergeRules?: unknown[] }} [opts]
 */
export function portalBuildServerResolvedRosterKeySets(rosterKeys, packs, opts = {}) {
  const submittedFb = portalSubmittedFeedbackKeysForMemory(packs || {});
  const absentAll = [
    ...new Set([...(packs?.absentFeedbackKeys || []), ...(packs?.absentKeys || [])]),
  ];
  const cancelledKeys = [...new Set(packs?.cancellationKeys || [])];
  /** @type {Set<string>} */
  const feedback = new Set();
  /** @type {Set<string>} */
  const absent = new Set();
  /** @type {Set<string>} */
  const cancelled = new Set();

  function fanOut(keys, target) {
    for (const rk of rosterKeys || []) {
      const rosterKey = String(rk || "").trim();
      if (!rosterKey) continue;
      for (const fk of keys || []) {
        if (portalFeedbackSubmittedKeyMatchesRosterKey(fk, rosterKey, opts)) {
          target.add(rosterKey);
        }
      }
    }
  }

  fanOut(submittedFb, feedback);
  fanOut(absentAll, absent);
  fanOut(cancelledKeys, cancelled);
  return { feedback, absent, cancelled };
}

/**
 * Drop stale tablet greens: after server sync, roster keys on/after `serverTruthFromIso`
 * must be backed by Supabase (feedback, absent, cancellation, or quick mark).
 * @param {Record<string, { feedbackDone?: boolean, incident?: boolean, absent?: boolean, cancelled?: boolean }>} memory
 * @param {string[]} rosterKeys
 * @param {{ feedbackKeys?: string[], absentFeedbackKeys?: string[], incidentKeys?: string[], cancellationKeys?: string[], absentKeys?: string[], quickFeedbackDoneKeys?: string[] }} packs
 * @param {{ serverTruthFromIso?: string, catchUpSessionDates?: string[], feedbackMergeRules?: unknown[] }} [opts]
 */
export function portalReconcileReviewMemoryWithServer(memory, rosterKeys, packs, opts = {}) {
  const serverTruthFromIso = String(opts.serverTruthFromIso || "2026-06-01").trim();
  const catchUp = new Set(
    (Array.isArray(opts.catchUpSessionDates) ? opts.catchUpSessionDates : [])
      .map((d) => String(d || "").trim().slice(0, 10))
      .filter(Boolean)
  );
  if (!memory || !Array.isArray(rosterKeys) || !rosterKeys.length) return false;

  const absentFb = [...new Set(packs.absentFeedbackKeys || [])];
  const submittedFb = portalSubmittedFeedbackKeysForMemory(packs);
  const absentAll = [...new Set([...absentFb, ...(packs.absentKeys || [])])];
  const cancelledKeys = [...new Set(packs.cancellationKeys || [])];

  /** @type {Set<string>} */
  const resolved = new Set();
  function markResolved(keys) {
    for (const rk of rosterKeys) {
      const rosterKey = String(rk || "").trim();
      if (!rosterKey) continue;
      for (const fk of keys || []) {
        if (portalFeedbackSubmittedKeyMatchesRosterKey(fk, rosterKey, opts)) {
          resolved.add(rosterKey);
        }
      }
    }
  }
  markResolved(submittedFb);
  markResolved(absentAll);
  markResolved(cancelledKeys);

  let changed = false;
  for (const rk of rosterKeys) {
    const rosterKey = String(rk || "").trim();
    if (!rosterKey) continue;
    const iso = portalReviewKeyDateIso(rosterKey);
    if (!iso || iso < serverTruthFromIso || catchUp.has(iso)) continue;
    if (resolved.has(rosterKey)) continue;
    const prev = memory[rosterKey] || portalReviewMemoryBase();
    if (prev.absent || prev.cancelled) continue;
    if (prev.feedbackDone) {
      memory[rosterKey] = { ...prev, feedbackDone: false };
      changed = true;
    }
  }
  return changed;
}

/**
 * Polls `auth_session_generation`; when server value exceeds the cached value, signs out (another terminal logged in).
 * @returns {() => void}
 */
export function bindPortalRemoteLogoutOnStaleAuthGeneration(supabase, userId, opts = {}) {
  let loginUrl = String(
    opts.loginUrl ||
      (typeof window !== "undefined" && window.PORTAL_LOGIN_REDIRECT_URL) ||
      ""
  ).trim();
  if (!loginUrl && typeof window !== "undefined" && window.location) {
    try {
      loginUrl = new URL("login.html", window.location.href).href;
    } catch {
      loginUrl = "login.html";
    }
  }
  let stopped = false;
  /** @type {ReturnType<typeof setInterval> | null} */
  let intervalId = null;

  async function tick() {
    if (stopped || !userId) return;
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("auth_session_generation")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return;
    const remote = Number(data.auth_session_generation) || 0;
    const cached = portalGetCachedAuthSessionGeneration();
    if (cached != null && remote > cached) {
      stopped = true;
      if (intervalId != null) clearInterval(intervalId);
      try {
        await portalLogout();
      } catch {
        /* ignore */
      }
      window.location.href = loginUrl;
      return;
    }
    portalSetCachedAuthSessionGeneration(remote);
  }

  void tick();
  intervalId = setInterval(() => {
    void tick();
  }, 45000);
  const onVis = () => {
    if (document.visibilityState === "visible") void tick();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    stopped = true;
    if (intervalId != null) clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVis);
  };
}

/**
 * Logout: Supabase signOut + clear cached staff context.
 * @returns {Promise<{ error: import("@supabase/supabase-js").AuthError | null }>}
 */
/** Read a Supabase Auth access token from browser storage (same-origin dashboards + forms). */
export function portalReadPersistedSupabaseAccessToken() {
  const parseToken = (raw) => {
    try {
      if (!raw) return "";
      const data = JSON.parse(raw);
      if (data && typeof data.access_token === "string" && data.access_token) {
        return String(data.access_token);
      }
      if (data?.currentSession?.access_token) {
        return String(data.currentSession.access_token);
      }
    } catch {
      /* ignore */
    }
    return "";
  };
  if (typeof window === "undefined") return "";
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k || !/^sb-.*-auth-token/i.test(k)) continue;
        const tok = parseToken(store.getItem(k));
        if (tok) return tok;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Remove Supabase Auth tokens from browser storage (same-origin). */
export function portalClearPersistedSupabaseAuth() {
  const drop = (store) => {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && /^sb-.*-auth-token/i.test(k)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    } catch {
      /* ignore */
    }
  };
  if (typeof window !== "undefined") {
    drop(localStorage);
    drop(sessionStorage);
  }
  _client = null;
}

export async function portalLogout() {
  try {
    const { endPortalVisitSession } = await import(
      "./portal_visit_tracker.js?v=20260610-visit-heartbeat-light"
    );
    await endPortalVisitSession();
  } catch {
    /* visit tracker optional */
  }
  if (typeof window !== "undefined" && typeof window.__PORTAL_AUTH_GEN_DISPOSE__ === "function") {
    try {
      window.__PORTAL_AUTH_GEN_DISPOSE__();
    } catch {
      /* ignore */
    }
    try {
      window.__PORTAL_AUTH_GEN_DISPOSE__ = null;
    } catch {
      /* ignore */
    }
  }
  clearPortalStaffContext();
  portalClearCachedAuthSessionGeneration();
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    portalClearPersistedSupabaseAuth();
    return { error };
  } catch {
    portalClearPersistedSupabaseAuth();
    /* Missing config, offline, or SDK error — local session already cleared above */
    return { error: null };
  }
}
