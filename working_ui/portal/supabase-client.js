/**
 * Browser Supabase client (Supabase JS v2, ESM CDN — browser-safe).
 * Uses window.SUPABASE_URL and window.SUPABASE_ANON_KEY when set.
 * Optional: DEFAULT_* below if you cannot inject globals.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm?v=20260429-portal";

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
 * @param {{ rosterSessionKeys?: string[] }} [opts]
 * @returns {Promise<{ feedbackKeys: string[], incidentKeys: string[], cancellationKeys: string[], absentKeys: string[], quickFeedbackDoneKeys: string[] }>}
 */
export async function portalFetchSubmittedReviewSessionKeys(supabase, userId, opts = {}) {
  const empty = {
    feedbackKeys: [],
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

  const [fb, inc, can, fbSharedRpc, quickMarks] = await Promise.all([
    supabase
      .from("session_feedback")
      .select("portal_session_key")
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
  ]);

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

  const ownFb = dedupeKeys(fb.data);
  const sharedFb = !fbSharedRpc || fbSharedRpc.error ? [] : feedbackKeysFromSharedRpc(fbSharedRpc.data);
  const feedbackMerged = [...new Set([...ownFb, ...sharedFb])];

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

/**
 * Merge server truth into the dashboard's in-memory review map (same object as localStorage mirror).
 * @param {Record<string, { feedbackDone?: boolean, incident?: boolean, absent?: boolean, cancelled?: boolean }>} memory
 * @param {{ feedbackKeys: string[], incidentKeys: string[], cancellationKeys: string[], absentKeys?: string[], quickFeedbackDoneKeys?: string[] }} packs
 */
export function portalMergeReviewKeysIntoMemoryMap(memory, packs) {
  const base = () => ({
    feedbackDone: false,
    incident: false,
    absent: false,
    cancelled: false,
  });
  let changed = false;
  for (const k of packs.feedbackKeys || []) {
    const prev = memory[k] || base();
    if (!prev.feedbackDone) {
      memory[k] = { ...prev, feedbackDone: true };
      changed = true;
    }
  }
  for (const k of packs.quickFeedbackDoneKeys || []) {
    const prev = memory[k] || base();
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
  return changed;
}

/**
 * Polls `auth_session_generation`; when server value exceeds the cached value, signs out (another terminal logged in).
 * @returns {() => void}
 */
export function bindPortalRemoteLogoutOnStaleAuthGeneration(supabase, userId, opts = {}) {
  const loginUrl = String(
    opts.loginUrl ||
      (typeof window !== "undefined" && window.PORTAL_LOGIN_REDIRECT_URL) ||
      "https://www.clubsensational.org/l0/"
  ).trim();
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
export async function portalLogout() {
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
    const { error } = await supabase.auth.signOut();
    return { error };
  } catch {
    /* Missing config, offline, or SDK error — local session already cleared above */
    return { error: null };
  }
}
