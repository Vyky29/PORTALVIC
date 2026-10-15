/**
 * Ealing year INV-Ps (INV-P-0328/0329/0330/0332) were pushed to Xero from the portal on 15 Oct.
 * Xero keeps one EAL-<cycle> invoice per remittance instead, so: void each in Xero (only if no
 * payments / credit) and clear xero_invoice_id / push status on the portal share.
 *
 * Dry run by default.
 *   npx -y deno run -A database/local-vault/office-ealing-year-invoices-unpush-xero-20261015.ts [--apply]
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

const NUMBERS = ["INV-P-0328", "INV-P-0329", "INV-P-0330", "INV-P-0332"];
const APPLY = Deno.args.includes("--apply");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = { ...xeroAuthHeaders(token), "Content-Type": "application/json" };

const r = await fetch(`${XERO_API}/Invoices?InvoiceNumbers=${NUMBERS.join(",")}`, { headers: h });
const live = (r.ok ? (await r.json()).Invoices || [] : []).filter((i: any) => i.Type === "ACCREC" && !["VOIDED", "DELETED"].includes(i.Status));
for (const num of NUMBERS) {
  const inv = live.find((i: any) => i.InvoiceNumber === num);
  const { data: share } = await admin.from("portal_parent_invoice_share").select("id, xero_invoice_id, notes").eq("invoice_number", num).maybeSingle();
  if (!/_ealing_year|\[\[ealing:/i.test(String(share?.notes || ""))) {
    console.log(`${num}: portal row is not an Ealing year invoice - skip`);
    continue;
  }
  if (inv) {
    const busy = (inv.Payments || []).length || (inv.CreditNotes || []).length || Number(inv.AmountPaid) > 0 || Number(inv.AmountCredited) > 0;
    console.log(`${num} | Xero ${inv.Status} | ${inv.Contact?.Name} | £${inv.Total} | due £${inv.AmountDue}${busy ? " | HAS PAYMENT/CREDIT - left alone" : ""}`);
    if (busy) continue;
    if (APPLY) {
      const v = await fetch(`${XERO_API}/Invoices/${inv.InvoiceID}`, { method: "POST", headers: h, body: JSON.stringify({ Invoices: [{ InvoiceID: inv.InvoiceID, Status: "VOIDED" }] }) });
      console.log(`  void: ${v.status} ${v.ok ? "" : (await v.text()).slice(0, 300)}`);
      if (!v.ok) continue;
    }
  } else {
    console.log(`${num} | not live in Xero`);
  }
  if (share?.xero_invoice_id) {
    console.log(`  portal: clear xero_invoice_id ${String(share.xero_invoice_id).slice(0, 8)}...${APPLY ? "" : " (dry run)"}`);
    if (APPLY) {
      const up = await admin.from("portal_parent_invoice_share")
        .update({ xero_invoice_id: null, xero_push_status: null, xero_push_error: null, xero_synced_at: null, updated_at: new Date().toISOString() })
        .eq("id", share.id);
      console.log(`  portal ${up.error ? "error " + up.error.message : "cleared"}`);
    }
  }
}
console.log(APPLY ? "done" : "dry run: re-run with --apply");
await xeroPersistRefreshToDb(admin);
