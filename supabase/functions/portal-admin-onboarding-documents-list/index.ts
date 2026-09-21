import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  matchStaffPinRow,
  missingOnboardingPinChecks,
  onboardingPayloadSubmitted,
} from "../_shared/portal_onboarding_pin.ts";

type DocType =
  | "checklist"
  | "passport"
  | "certificate"
  | "firstaid"
  | "safeguarding";

type OnboardingDocRow = {
  type: DocType;
  name: string;
  path: string;
  storageBucket: string;
  size: number | null;
  created: string | null;
  source: "onboarding";
  applicant_session_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_BUCKETS = ["club-files", "club-onboarding"];

const FOLDER_SPECS: Array<{ folder: string; type: DocType }> = [
  { folder: "checklist", type: "checklist" },
  { folder: "passport", type: "passport" },
  { folder: "certificate", type: "certificate" },
  { folder: "first_aid", type: "firstaid" },
];

/** Prefer filename signals over storage folder — applicants often pick the wrong type. */
function classifyDocType(folderType: DocType, nameOrPath: string): DocType {
  const base = String(nameOrPath || "").toLowerCase();
  if (base.includes("safeguarding") || base.includes("nspcc")) return "safeguarding";
  if (
    base.startsWith("firstaid-") ||
    base.includes("/firstaid-") ||
    /first[_-]?aid/.test(base)
  ) {
    return "firstaid";
  }
  if (base.includes("checklist") || base.includes("starter")) return "checklist";
  if (
    base.includes("passport") ||
    /\bdbs\b/.test(base) ||
    base.includes("right_to_work") ||
    base.includes("rtw")
  ) {
    return "passport";
  }
  return folderType;
}

function mapFileRow(
  folder: string,
  bucket: string,
  spec: { type: DocType },
  fileName: string,
  fullPath: string,
  entry: {
    created_at?: string;
    updated_at?: string;
    metadata?: { size?: number; lastModified?: string } | null;
  },
  applicantSessionId: string | null,
): OnboardingDocRow {
  const size = entry.metadata?.size ?? null;
  const created =
    entry.created_at ||
    entry.updated_at ||
    entry.metadata?.lastModified ||
    null;
  const type = classifyDocType(spec.type, `${fullPath} ${fileName}`);
  return {
    type,
    name: fileName,
    path: fullPath,
    storageBucket: bucket,
    size: typeof size === "number" ? size : null,
    created: created ? String(created) : null,
    source: "onboarding",
    applicant_session_id: applicantSessionId,
  };
}

async function listFolder(
  obAdmin: SupabaseClient,
  bucket: string,
  spec: { folder: string; type: DocType },
): Promise<{ items: OnboardingDocRow[]; error?: string }> {
  const { data, error } = await obAdmin.storage.from(bucket).list(spec.folder, {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return { items: [], error: error.message };

  const items: OnboardingDocRow[] = [];
  for (const entry of data || []) {
    if (!entry?.name || String(entry.name).startsWith(".")) continue;
    const name = String(entry.name);
    if (name.endsWith("/")) continue;

    if (UUID_RE.test(name)) {
      const sub = await obAdmin.storage.from(bucket).list(`${spec.folder}/${name}`, {
        limit: 500,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (sub.error) continue;
      for (const f of sub.data || []) {
        if (!f?.name || f.name.endsWith("/")) continue;
        if (!f.id && !(f.metadata && f.metadata.size != null)) continue;
        items.push(
          mapFileRow(
            spec.folder,
            bucket,
            spec,
            f.name,
            `${spec.folder}/${name}/${f.name}`,
            f,
            name,
          ),
        );
      }
      continue;
    }

    if (!entry.id && !(entry.metadata && entry.metadata.size != null)) continue;
    items.push(
      mapFileRow(
        spec.folder,
        bucket,
        spec,
        name,
        `${spec.folder}/${name}`,
        entry,
        null,
      ),
    );
  }
  return { items };
}

/** Legacy uploads used `{uuid}/{folder}/file` at bucket root (before folder-first paths). */
async function listLegacyApplicantFolder(
  obAdmin: SupabaseClient,
  bucket: string,
  spec: { folder: string; type: DocType },
): Promise<OnboardingDocRow[]> {
  const { data, error } = await obAdmin.storage.from(bucket).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return [];

  const items: OnboardingDocRow[] = [];
  for (const entry of data || []) {
    if (!entry?.name || String(entry.name).startsWith(".")) continue;
    const aid = String(entry.name);
    if (!UUID_RE.test(aid)) continue;
    const sub = await obAdmin.storage.from(bucket).list(`${aid}/${spec.folder}`, {
      limit: 500,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (sub.error) continue;
    for (const f of sub.data || []) {
      if (!f?.name || f.name.endsWith("/")) continue;
      if (!f.id && !(f.metadata && f.metadata.size != null)) continue;
      items.push(
        mapFileRow(
          spec.folder,
          bucket,
          spec,
          f.name,
          `${aid}/${spec.folder}/${f.name}`,
          f,
          aid,
        ),
      );
    }
  }
  return items;
}

async function listAllDocuments(obAdmin: SupabaseClient, bucket: string) {
  const results = await Promise.all(
    FOLDER_SPECS.map(async (spec) => {
      const modern = await listFolder(obAdmin, bucket, spec);
      const legacy = await listLegacyApplicantFolder(obAdmin, bucket, spec);
      return {
        items: [...modern.items, ...legacy],
        error: modern.error,
      };
    }),
  );
  const errors: string[] = [];
  const seen = new Set<string>();
  const documents: OnboardingDocRow[] = [];
  for (const res of results) {
    if (res.error) errors.push(res.error);
    for (const row of res.items) {
      const key = `${row.storageBucket}|${row.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      documents.push(row);
    }
  }
  documents.sort((a, b) => {
    const ta = a.created ? Date.parse(a.created) : 0;
    const tb = b.created ? Date.parse(b.created) : 0;
    return tb - ta;
  });
  return { documents, errors };
}

async function resolveOnboardingBucket(obAdmin: SupabaseClient): Promise<{
  bucket: string;
  errors: string[];
}> {
  const envBucket = (Deno.env.get("ONBOARDING_STORAGE_BUCKET") ?? "").trim();
  const candidates = [
    ...(envBucket ? [envBucket] : []),
    ...DEFAULT_BUCKETS,
  ].filter((b, i, arr) => b && arr.indexOf(b) === i);

  const errors: string[] = [];
  for (const bucket of candidates) {
    const probe = await obAdmin.storage.from(bucket).list("passport", { limit: 1 });
    if (!probe.error) return { bucket, errors };
    errors.push(`${bucket}: ${probe.error.message}`);
  }
  return { bucket: candidates[0] || "club-files", errors };
}

type UploadCounts = {
  passport: number;
  checklist: number;
  certificate: number;
  firstaid: number;
  safeguarding: number;
};

type UploadPaths = {
  passport: string[];
  checklist: string[];
  certificate: string[];
  firstaid: string[];
  safeguarding: string[];
};

type ApplicantProgress = {
  applicant_session_id: string;
  display_name: string;
  portal_staff_name: string;
  job: boolean;
  health: boolean;
  job_submitted: boolean;
  health_submitted: boolean;
  photo: boolean;
  pin_issued: boolean;
  pin: string | null;
  pin_name: string | null;
  login_username: string | null;
  missing: string[];
  ready_for_pin: boolean;
  uploads: UploadCounts;
  upload_paths: UploadPaths;
  updated_at: string | null;
  last_online_at: string | null;
  last_upload_at: string | null;
};

function emptyApplicant(id: string, name = ""): ApplicantProgress {
  return {
    applicant_session_id: id,
    display_name: name,
    portal_staff_name: name,
    job: false,
    health: false,
    job_submitted: false,
    health_submitted: false,
    photo: false,
    pin_issued: false,
    pin: null,
    pin_name: null,
    login_username: null,
    missing: [],
    ready_for_pin: false,
    uploads: emptyUploadCounts(),
    upload_paths: emptyUploadPaths(),
    updated_at: null,
    last_online_at: null,
    last_upload_at: null,
  };
}

type SessionRow = { name: string; updated_at: string | null };

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function lastUploadAtForApplicant(
  documents: OnboardingDocRow[],
  applicantId: string,
): string | null {
  let best: string | null = null;
  for (const doc of documents) {
    if (doc.applicant_session_id !== applicantId) continue;
    const ts = doc.created ? String(doc.created) : null;
    if (ts && (!best || Date.parse(ts) > Date.parse(best))) best = ts;
  }
  return best;
}

function emptyUploadCounts(): UploadCounts {
  return { passport: 0, checklist: 0, certificate: 0, firstaid: 0, safeguarding: 0 };
}

function emptyUploadPaths(): UploadPaths {
  return {
    passport: [],
    checklist: [],
    certificate: [],
    firstaid: [],
    safeguarding: [],
  };
}

function displayNameFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const meta = p._portal;
  if (meta && typeof meta === "object") {
    const staff = String((meta as Record<string, unknown>).staff_name ?? "").trim();
    if (staff) return staff;
  }
  const name = String(p.name ?? "").trim();
  const surname = String(p.surname ?? "").trim();
  if (name && surname) return `${name} ${surname}`.trim();
  const parts = [
    p.firstName,
    p.lastName,
    p.first_name,
    p.last_name,
    p.fullName,
    p.full_name,
    p.name,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`.trim();
  return parts[0] || surname || "";
}

function countDocForApplicant(doc: OnboardingDocRow, counts: UploadCounts) {
  if (doc.type === "passport") counts.passport++;
  else if (doc.type === "checklist") counts.checklist++;
  else if (doc.type === "firstaid") counts.firstaid++;
  else if (doc.type === "safeguarding") counts.safeguarding++;
  else if (doc.type === "certificate") counts.certificate++;
}

function pushDocPath(paths: UploadPaths, doc: OnboardingDocRow) {
  const list = paths[doc.type];
  if (!list) return;
  if (doc.path && !list.includes(doc.path)) list.push(doc.path);
}

function uploadCountsFromDocuments(documents: OnboardingDocRow[]) {
  const counts = emptyUploadCounts();
  for (const doc of documents) countDocForApplicant(doc, counts);
  return counts;
}

function perApplicantUploads(
  documents: OnboardingDocRow[],
  applicantId: string,
): UploadCounts {
  const counts = emptyUploadCounts();
  for (const doc of documents) {
    if (doc.applicant_session_id === applicantId) countDocForApplicant(doc, counts);
  }
  return counts;
}

function perApplicantUploadPaths(
  documents: OnboardingDocRow[],
  applicantId: string,
): UploadPaths {
  const paths = emptyUploadPaths();
  const matched = documents
    .filter((doc) => doc.applicant_session_id === applicantId)
    .sort((a, b) => {
      const ta = a.created ? Date.parse(a.created) : 0;
      const tb = b.created ? Date.parse(b.created) : 0;
      return tb - ta;
    });
  for (const doc of matched) pushDocPath(paths, doc);
  return paths;
}

async function loadRegisteredSessions(
  obAdmin: SupabaseClient,
): Promise<Map<string, SessionRow>> {
  const map = new Map<string, SessionRow>();
  const { data, error } = await obAdmin
    .from("onboarding_applicant_sessions")
    .select("applicant_session_id, portal_staff_name, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.warn("[portal-admin-onboarding-documents-list] sessions", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const id = String(row.applicant_session_id ?? "").trim();
    const name = String(row.portal_staff_name ?? "").trim();
    if (!id || !name || map.has(id)) continue;
    map.set(id, {
      name,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    });
  }
  return map;
}

async function loadApplicantProgress(
  draftsDb: SupabaseClient,
  documents: OnboardingDocRow[],
  portalAdmin?: SupabaseClient,
): Promise<ApplicantProgress[]> {
  // Job/health drafts + session touch live on Portal; document files may still be on OB storage.
  const sessions = await loadRegisteredSessions(draftsDb);
  const { data, error } = await draftsDb
    .from("onboarding_applicant_drafts")
    .select("applicant_session_id, form_type, payload, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.warn("[portal-admin-onboarding-documents-list] drafts", error.message);
  }

  const byId = new Map<string, ApplicantProgress>();

  for (const [id, sess] of sessions) {
    const entry = emptyApplicant(id, sess.name);
    entry.last_online_at = sess.updated_at;
    byId.set(id, entry);
  }

  for (const row of data ?? []) {
    const id = String(row.applicant_session_id ?? "").trim();
    if (!id) continue;
    let entry = byId.get(id);
    if (!entry) {
      entry = emptyApplicant(id);
      entry.last_online_at = sessions.get(id)?.updated_at ?? null;
      byId.set(id, entry);
    }
    const dn = displayNameFromPayload(row.payload);
    if (dn && !entry.display_name) entry.display_name = dn;
    const ft = String(row.form_type ?? "").toLowerCase();
    const submitted = onboardingPayloadSubmitted(row.payload);
    if (ft === "job") {
      entry.job = true;
      if (submitted) entry.job_submitted = true;
    }
    if (ft === "health") {
      entry.health = true;
      if (submitted) entry.health_submitted = true;
    }
    const ts = row.updated_at ? String(row.updated_at) : null;
    if (ts && (!entry.updated_at || ts > entry.updated_at)) entry.updated_at = ts;
    entry.last_online_at = maxIso(entry.last_online_at, ts);
  }

  for (const doc of documents) {
    const id = String(doc.applicant_session_id ?? "").trim();
    if (!id || !UUID_RE.test(id)) continue;
    if (!byId.has(id)) {
      const created = emptyApplicant(id, sessions.get(id)?.name || "");
      created.last_online_at = sessions.get(id)?.updated_at ?? null;
      byId.set(id, created);
    }
  }

  for (const entry of byId.values()) {
    const sess = sessions.get(entry.applicant_session_id);
    if (!entry.portal_staff_name && sess) {
      entry.portal_staff_name = sess.name;
    }
    if (!entry.display_name) {
      entry.display_name = entry.portal_staff_name ||
        ("Session " + entry.applicant_session_id.slice(0, 8));
    }
    entry.uploads = perApplicantUploads(documents, entry.applicant_session_id);
    entry.upload_paths = perApplicantUploadPaths(
      documents,
      entry.applicant_session_id,
    );
    entry.last_upload_at = lastUploadAtForApplicant(
      documents,
      entry.applicant_session_id,
    );
    if (sess?.updated_at) {
      entry.last_online_at = maxIso(entry.last_online_at, sess.updated_at);
    }
  }

  if (portalAdmin) {
    const ids = Array.from(byId.keys());
    if (ids.length) {
      const { data: healthRows } = await portalAdmin
        .from("staff_health_questionnaire_drafts")
        .select("staff_session_id, staff_name, submitted_at, updated_at")
        .in("staff_session_id", ids);
      for (const row of healthRows ?? []) {
        const id = String(row.staff_session_id ?? "").trim();
        if (!id) continue;
        let entry = byId.get(id);
        if (!entry) {
          const name = String(row.staff_name ?? "").trim();
          entry = emptyApplicant(id, name);
          entry.last_online_at = sessions.get(id)?.updated_at ?? null;
          byId.set(id, entry);
        }
        if (row.submitted_at) {
          entry.health = true;
          entry.health_submitted = true;
        }
        const ts = row.updated_at ? String(row.updated_at) : null;
        if (ts) entry.last_online_at = maxIso(entry.last_online_at, ts);
        const name = String(row.staff_name ?? "").trim();
        if (name && !entry.display_name) entry.display_name = name;
        if (name && !entry.portal_staff_name) entry.portal_staff_name = name;
      }

      const { data: profiles } = await portalAdmin
        .from("staff_profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", ids);
      const { data: pinRows } = await portalAdmin
        .from("portal_login_pins")
        .select("name, pin, portal")
        .eq("portal", "staff");
      for (const profile of profiles ?? []) {
        const id = String(profile.id || "").trim();
        const entry = byId.get(id);
        if (!entry) continue;
        const username = String(profile.username || "").trim();
        const fullName = String(profile.full_name || "").trim();
        if (username) entry.login_username = username;
        if (fullName && !entry.display_name) entry.display_name = fullName;
        if (fullName && !entry.portal_staff_name) entry.portal_staff_name = fullName;
        entry.photo = !!String(profile.avatar_url || "").trim();
        const pinHit = matchStaffPinRow(pinRows || [], username, fullName);
        if (pinHit) {
          entry.pin_issued = true;
          entry.pin = pinHit.pin;
          entry.pin_name = pinHit.name;
        }
      }
    }
  }

  for (const entry of byId.values()) {
    entry.missing = missingOnboardingPinChecks({
      job_submitted: !!entry.job_submitted,
      health_submitted: !!entry.health_submitted,
      photo: !!entry.photo,
      passport: (entry.uploads?.passport || 0) > 0,
      checklist: (entry.uploads?.checklist || 0) > 0,
    });
    entry.ready_for_pin = !entry.pin_issued && entry.missing.length === 0;
  }

  return Array.from(byId.values()).sort((a, b) => {
    const ta = a.last_online_at
      ? Date.parse(a.last_online_at)
      : (a.updated_at ? Date.parse(a.updated_at) : 0);
    const tb = b.last_online_at
      ? Date.parse(b.last_online_at)
      : (b.updated_at ? Date.parse(b.updated_at) : 0);
    return tb - ta;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!portalUrl || !portalService) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }
  if (!obUrl || !obService) {
    return portalAdminJson(503, {
      ok: false,
      error: "onboarding_storage_not_configured",
      onboarding_configured: false,
    });
  }

  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const portalAdmin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { bucket, errors: bucketErrors } = await resolveOnboardingBucket(obAdmin);
  const { documents, errors: listErrors } = await listAllDocuments(obAdmin, bucket);
  const applicants = await loadApplicantProgress(portalAdmin, documents, portalAdmin);
  const upload_counts = uploadCountsFromDocuments(documents);
  const unlinked_documents = documents.filter((d) => !d.applicant_session_id).length;

  const counts = {
    all: documents.length,
    checklist: 0,
    passport: 0,
    certificate: 0,
    firstaid: 0,
    safeguarding: 0,
  };
  for (const doc of documents) {
    if (counts[doc.type] !== undefined) counts[doc.type]++;
  }

  return portalAdminJson(200, {
    ok: true,
    documents,
    counts,
    upload_counts,
    applicants,
    unlinked_documents,
    meta: {
      bucket,
      onboarding_project: obUrl,
      onboarding_configured: true,
      drafts_source: "portal_project",
      unlinked_documents,
      errors: [...bucketErrors, ...listErrors].filter(Boolean),
    },
  });
});
