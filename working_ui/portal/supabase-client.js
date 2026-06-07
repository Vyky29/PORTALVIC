/**
 * Browser Supabase client (Supabase JS v2, ESM CDN — browser-safe).
 * Uses window.SUPABASE_URL and window.SUPABASE_ANON_KEY when set.
 * Optional: DEFAULT_* below if you cannot inject globals.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEFAULT_SUPABASE_URL = "https://cklpnwhlqsulpmkipmqb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE";

const STORAGE_KEY = "portal_staff_context";
/** Last seen `staff_profiles.auth_session_generation` for this tab (sessionStorage). */
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
    const raw = sessionStorage.getItem(PORTAL_AUTH_GEN_SESSION_KEY);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function portalSetCachedAuthSessionGeneration(n) {
  try {
    sessionStorage.setItem(PORTAL_AUTH_GEN_SESSION_KEY, String(Number(n) || 0));
  } catch {
    /* ignore */
  }
}

export function portalClearCachedAuthSessionGeneration() {
  try {
    sessionStorage.removeItem(PORTAL_AUTH_GEN_SESSION_KEY);
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
 * Session keys with server-side submissions in the last ~60 days.
 * Feedback: own rows plus, when `opts.rosterSessionKeys` is set, any submission for those
 * `portal_session_key` values (co-instructors on the same slot share one key).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 * @param {{ rosterSessionKeys?: string[], catchUpSessionDates?: string[] }} [opts]
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
  since.setDate(since.getDate() - 60);
  const sinceStr = since.toISOString().slice(0, 10);

  const rawRoster = opts && Array.isArray(opts.rosterSessionKeys) ? opts.rosterSessionKeys : [];
  const rosterSessionKeys = [...new Set(rawRoster.map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 250);
  const catchUpDates = (
    opts && Array.isArray(opts.catchUpSessionDates) ? opts.catchUpSessionDates : []
  )
    .map((d) => String(d || "").trim().slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  const [fb, inc, can, fbSharedRpc, quickMarks, fbCatchUp] = await Promise.all([
    supabase
      .from("session_feedback")
      .select("portal_session_key, attendance")
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
    rosterSessionKeys.length
      ? supabase.rpc("portal_feedback_submitted_keys_for_sessions", { p_keys: rosterSessionKeys })
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
          .select("portal_session_key, attendance")
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
  const sharedFb = !fbSharedRpc || fbSharedRpc.error ? [] : feedbackKeysFromSharedRpc(fbSharedRpc.data);

  /** Roster peer read (RLS): co-instructors see keys even when area suffix differs from roster key. */
  let peerParts = { present: [], absent: [] };
  if (rosterSessionKeys.length) {
    const rosterDates = [
      ...new Set(
        rosterSessionKeys
          .map((k) => String(k || "").split("|")[0].trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      ),
    ].slice(0, 21);
    if (rosterDates.length) {
      try {
        const peerRes = await supabase
          .from("session_feedback")
          .select("portal_session_key, attendance")
          .in("session_date", rosterDates)
          .not("portal_session_key", "is", null)
          .gte("session_date", sinceStr)
          .limit(400);
        if (!peerRes.error) peerParts = partitionFeedbackRows(peerRes.data);
      } catch (ePeer) {
        console.debug("[portal] session_feedback peer keys", ePeer);
      }
    }
  }

  const absentFeedbackKeys = [
    ...new Set([
      ...ownParts.absent,
      ...catchUpParts.absent,
      ...peerParts.absent,
    ]),
  ];
  const feedbackMerged = [
    ...new Set([
      ...ownParts.present,
      ...catchUpParts.present,
      ...peerParts.present,
      ...sharedFb,
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

  return {
    feedbackKeys: feedbackMerged,
    absentFeedbackKeys,
    incidentKeys: dedupeKeys(inc.data),
    cancellationKeys: dedupeKeys(can.data),
    absentKeys,
    quickFeedbackDoneKeys,
  };
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

function portalSessionKeyClientSlugsMatch(submittedKey, rosterKey) {
  const rSlugs = clientSlugTokensFromPortalSessionKey(rosterKey);
  const sSlugs = clientSlugTokensFromPortalSessionKey(submittedKey);
  if (!rSlugs.length || !sSlugs.length) return false;
  for (const rs of rSlugs) {
    for (const ss of sSlugs) {
      if (rs === ss || rs.includes(ss) || ss.includes(rs)) return true;
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
  const last = parts[parts.length - 1];
  if (last === "day_centre") return last;
  if (/^\d{4}-\d{2}-\d{2}$/.test(last) || /^\d{1,2}:\d{2}$/.test(last)) return "";
  if (parts.length >= 5) return last;
  if (/^\d{1,2}:\d{2}$/.test(parts[1])) return last;
  return "";
}

function portalSessionKeyAreaTokensCompatible(submittedKey, rosterKey) {
  const sArea = portalSessionKeyAreaToken(submittedKey);
  const rArea = portalSessionKeyAreaToken(rosterKey);
  if (!sArea && !rArea) return true;
  if (!sArea || !rArea) return false;
  return sArea === rArea;
}

/**
 * Roster keys use `YYYY-MM-DD|HH:mm|client_id`; Supabase often stores `YYYY-MM-DD||client_slug`.
 */
export function portalFeedbackSubmittedKeyMatchesRosterKey(submittedKey, rosterKey) {
  const s = String(submittedKey || "").trim();
  const r = String(rosterKey || "").trim();
  if (!s || !r) return false;
  if (s === r) return true;
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
  if (!portalSessionKeyAreaTokensCompatible(s, r)) return false;
  if (portalSessionKeyClientSlugsMatch(s, r)) return true;
  const rClientSlug = String(rParts[2] || rParts[1] || "")
    .trim()
    .toLowerCase();
  const sClientSlug = String(sParts[sParts.length - 1] || sParts[1] || "")
    .trim()
    .toLowerCase();
  if (/_ah$/.test(rClientSlug) && /_ah$/.test(sClientSlug) && rClientSlug !== sClientSlug) {
    return false;
  }
  const rClient = String(rParts[2] || rParts[1] || "")
    .trim()
    .toLowerCase();
  const sClient = String(sParts[sParts.length - 1] || sParts[1] || "")
    .trim()
    .toLowerCase();
  if (!rClient || !sClient) return false;
  return rClient === sClient || rClient.includes(sClient) || sClient.includes(rClient);
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
      if (!portalFeedbackSubmittedKeyMatchesRosterKey(fk, rosterKey)) continue;
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
 * @param {{ rosterSessionKeys?: string[] }} [opts]
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
  const submittedFb = [
    ...new Set([...(packs.feedbackKeys || []), ...(packs.quickFeedbackDoneKeys || [])]),
  ].filter((k) => absentFb.indexOf(k) < 0);
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
      "./portal_visit_tracker.js?v=20260601-visit-insert-fix"
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
