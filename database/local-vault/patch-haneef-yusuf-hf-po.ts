/**
 * Haneef Yusuf = H&F child ID 2396503 / PO 9005711782
 * (sheet listed him as "Ibrahim Yusuf").
 *
 * - Upsert LA client_payments row
 * - Flip INV-P-0103 to la_funded + regen PDF with Client ID / PO
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-haneef-yusuf-hf-po.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnvFile(path: string) {
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
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CONTACT_ID = "126";
const CLIENT_KEY = "haneef";
const CLIENT_NAME = "Haneef Yusuf";
const CLIENT_ID = "2396503";
const PO = "9005711782";

console.log(APPLY ? "APPLY" : "DRY RUN", CLIENT_NAME, CLIENT_ID, PO);

const { data: existing } = await admin
  .from("client_payments")
  .select("id, data, client_name")
  .eq("sheet", "LA")
  .eq("client_key", CLIENT_KEY)
  .maybeSingle();

const data = {
  ...((existing?.data as Record<string, unknown>) || {}),
  Services: "Multi-Activity",
  Funding: "Local authority · H&F",
  Funder: "H&F (Hammersmith & Fulham)",
  "Funding origin": "LA-funded",
  Payer: "Local authority / NHS (pays direct)",
  "Payment method": "LA invoice (BACS)",
  VAT: "Exempt",
  "Client Id": CLIENT_ID,
  "Client ID": CLIENT_ID,
  PO,
  po: PO,
  "Client Name": CLIENT_NAME,
};

if (existing?.id) {
  console.log("update LA row", existing.id, existing.client_name);
  if (APPLY) {
    const { error } = await admin
      .from("client_payments")
      .update({
        client_name: CLIENT_NAME,
        parent_name: "H&F · Sabrosa",
        data,
      })
      .eq("id", existing.id);
    if (error) {
      console.error(error.message);
      Deno.exit(1);
    }
  }
} else {
  const { data: maxRow } = await admin
    .from("client_payments")
    .select("row_index")
    .eq("sheet", "LA")
    .order("row_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rowIndex = Number(maxRow?.row_index || 9700) + 1;
  console.log("insert LA row", CLIENT_KEY, "row_index", rowIndex);
  if (APPLY) {
    const { error } = await admin.from("client_payments").insert({
      sheet: "LA",
      row_index: rowIndex,
      client_key: CLIENT_KEY,
      client_name: CLIENT_NAME,
      parent_name: "H&F · Sabrosa",
      payment_status: "Outstanding",
      amount: null,
      data,
      source_file: "office_hf_po_haneef_20260806",
    });
    if (error) {
      console.error(error.message);
      Deno.exit(1);
    }
  }
}

const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, payment_method_hint, vat_mode, line_description, notes")
  .eq("contact_id", CONTACT_ID)
  .neq("payment_status", "void");
if (shErr) {
  console.error(shErr.message);
  Deno.exit(1);
}

for (const share of shares || []) {
  console.log(
    "invoice",
    share.invoice_number,
    share.payment_method_hint,
    share.vat_mode,
    "→ la_funded + regen",
  );
  if (!APPLY) continue;
  let desc = String(share.line_description || "");
  const cut = desc.search(/\n\s*Client\s+ID\s*:/i);
  if (cut >= 0) desc = desc.slice(0, cut).trimEnd();
  const notes = [String(share.notes || "").trim(), `office_hf_po_haneef_${PO}`]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 800);
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_method_hint: "la_funded",
      vat_mode: "exempt",
      line_description: desc || share.line_description,
      share_status: "hidden",
      updated_at: new Date().toISOString(),
      notes,
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("update", share.invoice_number, upErr.message);
    Deno.exit(1);
  }
  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log("pdf", share.invoice_number, pdf);
  if (!pdf?.ok) Deno.exit(1);
}

console.log(APPLY ? "Done — Haneef H&F Client ID + PO seeded; invoices regenerated." : "Dry run OK. Re-run APPLY=1.");
