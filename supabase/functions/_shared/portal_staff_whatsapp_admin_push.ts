/**
 * Notify admins (Web Push) that a leader replied on Leader WhatsApp.
 * Used by Meta webhook and staff-portal reply edge function.
 */
export async function notifyAdminsStaffWhatsappReply(record: {
  id: string;
  staff_profile_id: string;
  staff_username: string;
  body_text: string;
  created_at?: string;
}): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret) {
    console.warn("[staff-wa-push] skip — missing PORTAL_PUSH_WEBHOOK_SECRET or SUPABASE_URL");
    return { ok: false, detail: "missing_secret" };
  }
  if (!record?.id) return { ok: false, detail: "missing_id" };

  try {
    const res = await fetch(`${baseUrl}/functions/v1/portal-push-dispatch-admin-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-portal-webhook-secret": secret,
      },
      body: JSON.stringify({
        type: "INSERT",
        table: "portal_staff_whatsapp_inbound",
        record: {
          id: String(record.id),
          staff_profile_id: String(record.staff_profile_id || ""),
          staff_username: String(record.staff_username || "").toLowerCase(),
          body_text: String(record.body_text || ""),
          created_at: String(record.created_at || new Date().toISOString()),
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[staff-wa-push] admin-alert failed", res.status, t.slice(0, 200));
      return { ok: false, status: res.status, detail: t.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.warn("[staff-wa-push] error", e);
    return { ok: false, detail: String(e) };
  }
}
