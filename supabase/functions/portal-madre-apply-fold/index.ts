// @ts-nocheck — Apply admin roster change → live MADRE in portal_madre_document.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  applyFoldToMadre,
  foldFromPortalRosterRow,
  foldFromScheduleOverride,
  type FoldInput,
  type MadreDoc,
} from "../_shared/portal_madre_fold_logic.ts";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const TERM_KEY = "summer-2026";
const WEBHOOK_SECRET_ENV = "PORTAL_MADRE_WEBHOOK_SECRET";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: portalAdminCorsHeaders(),
    });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return portalAdminJson(503, { ok: false, error: "supabase_not_configured" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_json" });
  }

  const webhookSecret = Deno.env.get(WEBHOOK_SECRET_ENV) ??
    Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const gotWebhook = req.headers.get("x-portal-webhook-secret") ?? "";
  const fromDbWebhook = !!webhookSecret && gotWebhook === webhookSecret;

  let actorId: string | null = null;
  if (!fromDbWebhook) {
    const auth = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
    if (!auth.ok) {
      return portalAdminJson(auth.status, { ok: false, error: auth.error });
    }
    actorId = auth.userId;
  }

  let fold: FoldInput | null = null;
  if (fromDbWebhook && body.record && typeof body.record === "object") {
    const table = String(body.table ?? "");
    const rec = body.record as Record<string, unknown>;
    if (table === "portal_roster_rows") fold = foldFromPortalRosterRow(rec);
    else if (table === "schedule_overrides") fold = foldFromScheduleOverride(rec);
    else {
      return portalAdminJson(200, { ok: true, skipped: true, reason: "table" });
    }
  } else if (body.fold_type) {
    fold = {
      fold_type: String(body.fold_type),
      session_date: body.session_date ? String(body.session_date) : null,
      payload: (body.payload && typeof body.payload === "object"
        ? body.payload
        : {}) as Record<string, unknown>,
    };
  } else {
    return portalAdminJson(400, { ok: false, error: "missing_fold" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: loadErr } = await admin
    .from("portal_madre_document")
    .select("document, revision")
    .eq("term_key", TERM_KEY)
    .maybeSingle();

  if (loadErr) {
    console.error("[portal-madre-apply-fold] load", loadErr);
    return portalAdminJson(500, { ok: false, error: "load_failed" });
  }
  if (!row?.document) {
    return portalAdminJson(409, {
      ok: false,
      error: "madre_not_seeded",
      hint: "Run seed_portal_madre_document.py once after migration.",
    });
  }

  const madre = row.document as MadreDoc;
  madre.meta = madre.meta ?? {};
  madre.meta.schemaVersion = 2;

  const result = applyFoldToMadre(madre, fold);
  madre.meta.lastLiveFoldAt = new Date().toISOString();
  madre.meta.lastLiveFoldNote = result.note;

  const nextRevision = (Number(row.revision) || 0) + 1;
  const { error: saveErr } = await admin
    .from("portal_madre_document")
    .update({
      document: madre,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("term_key", TERM_KEY);

  if (saveErr) {
    console.error("[portal-madre-apply-fold] save", saveErr);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    folded: result.ok,
    note: result.note,
    revision: nextRevision,
    term_key: TERM_KEY,
  });
});
