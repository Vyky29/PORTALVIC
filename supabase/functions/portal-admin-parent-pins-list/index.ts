// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-pins-list
// Office list of family portal PINs (readable) for support / login help.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const auth = String(req.headers.get("Authorization") || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data: userData, error } = await supabase.auth.getUser(m[1]);
  if (error || !userData?.user) return null;
  const uid = userData.user.id;
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("id, role, is_admin, is_ceo")
    .eq("id", uid)
    .maybeSingle();
  if (!staff) return null;
  const role = String(staff.role || "").toLowerCase();
  if (staff.is_admin || staff.is_ceo || role === "admin" || role === "ceo") return staff;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "config" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const admin = await requireAdmin(req, supabase);
  if (!admin) return json(403, { ok: false, error: "forbidden" });

  const { data: creds } = await supabase
    .from("portal_parent_portal_credentials")
    .select("parent_person_id, pin_display, changed_by_parent, updated_at")
    .order("updated_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("portal_parent_contacts")
    .select(
      "parent_person_id, parent_display, parent_first_name, parent_last_name, child_display, child_first_name, contact_id, email, mobile",
    )
    .limit(5000);

  const kidsByParent = new Map<string, string[]>();
  const parentMeta = new Map<string, { parent: string; email: string; mobile: string }>();
  for (const c of contacts || []) {
    const pid = String(c.parent_person_id || "");
    if (!pid) continue;
    const child = String(c.child_display || c.child_first_name || "").trim();
    if (!kidsByParent.has(pid)) kidsByParent.set(pid, []);
    if (child && !kidsByParent.get(pid)!.includes(child)) kidsByParent.get(pid)!.push(child);
    if (!parentMeta.has(pid)) {
      parentMeta.set(pid, {
        parent: String(c.parent_display || `${c.parent_first_name || ""} ${c.parent_last_name || ""}`).trim(),
        email: String(c.email || ""),
        mobile: String(c.mobile || ""),
      });
    }
  }

  const rows = (creds || []).map((r) => {
    const pid = String(r.parent_person_id);
    const meta = parentMeta.get(pid) || { parent: pid, email: "", mobile: "" };
    const kids = kidsByParent.get(pid) || [];
    return {
      parent_person_id: pid,
      parent: meta.parent,
      children: kids.join("; "),
      login_names: kids.map((k) => k.split(/\s+/)[0]).filter(Boolean).join(" / "),
      pin: String(r.pin_display || ""),
      changed_by_parent: !!r.changed_by_parent,
      updated_at: r.updated_at,
      email: meta.email,
      mobile: meta.mobile,
    };
  });

  return json(200, { ok: true, count: rows.length, pins: rows });
});
