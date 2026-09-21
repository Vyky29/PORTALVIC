/**
 * Notify office (Web Push) that a parent wrote on Family WhatsApp / parent app.
 * Same path as Leader WhatsApp → portal-push-dispatch-admin-alert.
 */
export async function notifyAdminsParentWhatsappInbound(record: {
  id: string;
  from_phone?: string;
  contact_name?: string;
  body_text?: string;
  message_type?: string;
  created_at?: string;
}): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret) {
    console.warn("[family-wa-push] skip — missing PORTAL_PUSH_WEBHOOK_SECRET or SUPABASE_URL");
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
        table: "portal_parent_whatsapp_inbound",
        record: {
          id: String(record.id),
          from_phone: String(record.from_phone || "").trim() || null,
          contact_name: String(record.contact_name || "").trim() || null,
          body_text: String(record.body_text || ""),
          message_type: String(record.message_type || "text"),
          created_at: String(record.created_at || new Date().toISOString()),
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[family-wa-push] admin-alert failed", res.status, t.slice(0, 200));
      return { ok: false, status: res.status, detail: t.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.warn("[family-wa-push] error", e);
    return { ok: false, detail: String(e) };
  }
}
