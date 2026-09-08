import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DocType = "passport" | "checklist" | "certificate" | "firstaid" | "safeguarding";

const DOC_FOLDER: Record<DocType, string> = {
  passport: "passport",
  checklist: "checklist",
  certificate: "certificate",
  firstaid: "first_aid",
  safeguarding: "certificate",
};

const DEFAULT_BUCKETS = ["club-files", "club-onboarding"];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

function safeFileName(name: string, docType: DocType): string {
  const base = String(name || "upload.bin")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
  if (docType === "safeguarding" && !/safeguarding/i.test(base)) {
    const dot = base.lastIndexOf(".");
    if (dot > 0) {
      return `safeguarding-${base.slice(0, dot)}${base.slice(dot)}`;
    }
    return `safeguarding-${base}`;
  }
  if (docType === "firstaid" && !/^firstaid-/i.test(base) && !/first.?aid/i.test(base)) {
    return `firstaid-${base}`;
  }
  return base || "upload.bin";
}

function decodeBase64(dataUrlOrB64: string): Uint8Array {
  let raw = String(dataUrlOrB64 || "").trim();
  const m = /^data:[^;]+;base64,(.+)$/i.exec(raw);
  if (m) raw = m[1];
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function resolveBucket(
  obAdmin: ReturnType<typeof createClient>,
): Promise<string> {
  const preferred = (Deno.env.get("ONBOARDING_STORAGE_BUCKET") ?? "").trim();
  const candidates = preferred
    ? [preferred, ...DEFAULT_BUCKETS.filter((b) => b !== preferred)]
    : DEFAULT_BUCKETS;
  for (const b of candidates) {
    const { error } = await obAdmin.storage.from(b).list("", { limit: 1 });
    if (!error) return b;
  }
  return candidates[0] || "club-files";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const jwt = bearerUserJwt(req);
  if (!jwt) return json(401, { ok: false, error: "unauthorized" });

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "")
    .trim();

  if (!portalUrl || !portalService) {
    return json(500, { ok: false, error: "misconfigured" });
  }
  if (!obUrl || !obService) {
    return json(503, { ok: false, error: "onboarding_not_configured" });
  }

  const portalAdmin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await portalAdmin.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  const userId = String(userData.user.id);
  if (!UUID_RE.test(userId)) {
    return json(400, { ok: false, error: "invalid_user" });
  }

  let body: {
    action?: string;
    doc_type?: string;
    file_name?: string;
    content_type?: string;
    content_base64?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const action = String(body.action || "upload").trim().toLowerCase();
  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = await resolveBucket(obAdmin);

  if (action === "list") {
    const types: DocType[] = [
      "passport",
      "checklist",
      "certificate",
      "firstaid",
      "safeguarding",
    ];
    const folders = ["passport", "checklist", "certificate", "first_aid"];
    const uploads: Array<{
      doc_type: string;
      name: string;
      path: string;
      created: string | null;
    }> = [];
    for (const folder of folders) {
      const { data } = await obAdmin.storage
        .from(bucket)
        .list(`${folder}/${userId}`, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });
      for (const f of data || []) {
        if (!f?.name || f.name.endsWith("/")) continue;
        const low = f.name.toLowerCase();
        let docType = "certificate";
        if (folder === "passport") docType = "passport";
        else if (folder === "checklist") docType = "checklist";
        else if (folder === "first_aid" || low.startsWith("firstaid-")) {
          docType = "firstaid";
        } else if (low.includes("safeguarding")) docType = "safeguarding";
        uploads.push({
          doc_type: docType,
          name: f.name,
          path: `${folder}/${userId}/${f.name}`,
          created: f.created_at || f.updated_at || null,
        });
      }
    }
    const counts: Record<string, number> = {};
    for (const t of types) counts[t] = 0;
    for (const u of uploads) {
      counts[u.doc_type] = (counts[u.doc_type] || 0) + 1;
    }
    return json(200, { ok: true, bucket, uploads, counts });
  }

  const docType = String(body.doc_type || "").trim().toLowerCase() as DocType;
  if (!DOC_FOLDER[docType]) {
    return json(400, { ok: false, error: "bad_doc_type" });
  }
  const b64 = String(body.content_base64 || "").trim();
  if (!b64) return json(400, { ok: false, error: "missing_file" });

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b64);
  } catch {
    return json(400, { ok: false, error: "bad_base64" });
  }
  if (bytes.byteLength < 16) {
    return json(400, { ok: false, error: "file_too_small" });
  }
  if (bytes.byteLength > 12 * 1024 * 1024) {
    return json(400, { ok: false, error: "file_too_large" });
  }

  const folder = DOC_FOLDER[docType];
  const fileName = safeFileName(String(body.file_name || "upload.bin"), docType);
  const path = `${folder}/${userId}/${fileName}`;
  const contentType = String(body.content_type || "application/octet-stream").trim() ||
    "application/octet-stream";

  const { error: upErr } = await obAdmin.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType,
    cacheControl: "3600",
  });
  if (upErr) {
    console.error("[portal-staff-onboarding-doc-upload]", upErr);
    return json(500, { ok: false, error: "upload_failed", detail: upErr.message });
  }

  const { data: profile } = await portalAdmin
    .from("staff_profiles")
    .select("full_name, username")
    .eq("id", userId)
    .maybeSingle();
  const staffName = String(profile?.full_name || profile?.username || "").trim();
  const now = new Date().toISOString();
  await obAdmin.from("onboarding_applicant_sessions").upsert({
    applicant_session_id: userId,
    portal_staff_name: staffName || null,
    updated_at: now,
  });

  return json(200, {
    ok: true,
    bucket,
    path,
    doc_type: docType,
    file_name: fileName,
    size: bytes.byteLength,
  });
});
