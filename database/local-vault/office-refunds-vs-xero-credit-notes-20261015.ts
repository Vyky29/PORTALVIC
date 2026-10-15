/**
 * Read only. Portal refunds (portal_parent_family_credits kind=refund, since 1 Aug) vs Xero ACCREC
 * credit notes (since 1 Aug) and their refund payments. Refunds settled before the 8 Oct auto-CN
 * change have no credit note.
 *
 *   npx -y deno run -A database/local-vault/office-refunds-vs-xero-credit-notes-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

function loadEnv(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: refunds, error } = await admin
  .from("portal_parent_family_credits")
  .select("id, participant_display, kind, status, amount_gbp, service_label, session_date, source, notes, linked_invoice_number, xero_credit_note_number, created_at, closed_at, close_notes")
  .eq("kind", "refund")
  .gte("created_at", "2026-08-01")
  .order("created_at");
if (error) console.log("portal error", error.message);
console.log(`PORTAL REFUNDS since 1 Aug: ${(refunds || []).length}`);
for (const r of refunds || []) {
  console.log(
    `${r.id} | ${String(r.created_at).slice(0, 10)} | ${r.status} | £${r.amount_gbp ?? "-"} | ${r.participant_display} | ${r.service_label || "-"} | session ${r.session_date || "-"} | ${r.source} | inv ${r.linked_invoice_number || "-"} | CN ${r.xero_credit_note_number || "NONE"} | closed ${String(r.closed_at || "").slice(0, 10) || "-"} | ${String(r.notes || r.close_notes || "").replace(/\s+/g, " ").slice(0, 70)}`,
  );
}

await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = xeroAuthHeaders(token);
const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : "";
};
console.log("\nXERO ACCREC CREDIT NOTES since 1 Aug:");
const where = encodeURIComponent('Type=="ACCRECCREDIT"&&Date>=DateTime(2026,08,01)');
for (let page = 1; page < 10; page++) {
  const r = await fetch(`${XERO_API}/CreditNotes?where=${where}&page=${page}`, { headers: h });
  const list = r.ok ? (await r.json()).CreditNotes || [] : [];
  for (const c of list.sort((a: any, b: any) => xdate(a.Date).localeCompare(xdate(b.Date)))) {
    if (c.Status === "DELETED" || c.Status === "VOIDED") continue;
    const alloc = (c.Allocations || []).map((a: any) => `${a.Invoice?.InvoiceNumber} £${a.Amount}`).join(", ");
    const pays = (c.Payments || []).map((p: any) => `${xdate(p.Date)} £${p.Amount}`).join(", ");
    console.log(`${xdate(c.Date)} | ${c.CreditNoteNumber} | ${c.Status} | ${c.Contact?.Name} | £${c.Total} | remaining £${c.RemainingCredit} | alloc ${alloc || "-"} | refunds ${pays || "-"} | ref ${c.Reference || "-"}`);
  }
  if (list.length < 100) break;
}
await xeroPersistRefreshToDb(admin);
