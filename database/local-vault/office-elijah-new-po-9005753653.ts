/**
 * Elijah — new H&F Purchase Order 9005753653 (was 9005340499).
 * Updates client_payments.PO, live INV-P text, portal_purchase_orders, regenerates PDFs.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-elijah-new-po-9005753653.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-elijah-new-po-9005753653.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CLIENT_KEY = "elijah";
const CLIENT_ID = "2500772";
const OLD_PO = "9005340499";
const NEW_PO = "9005753653";

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
  Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("PORTAL_SUPABASE_URL") ||
    "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function stripClientPoFooter(desc: string): string {
  const raw = String(desc || "");
  const cut = raw.search(/\n\s*Client\s+ID\s*:/i);
  if (cut >= 0) return raw.slice(0, cut).trimEnd();
  const cutPo = raw.search(/\n\s*PO\s*:/i);
  if (cutPo >= 0) return raw.slice(0, cutPo).trimEnd();
  return raw;
}

function replacePoInText(text: string, oldPo: string, newPo: string): string {
  let out = String(text || "");
  if (oldPo && oldPo !== newPo) out = out.split(oldPo).join(newPo);
  out = out.replace(/(PO\s*:\s*)([^\n\r]+)/gi, `$1${newPo}`);
  return out;
}

console.log("Elijah PO update —", APPLY ? "APPLY" : "DRY RUN");
console.log({ CLIENT_KEY, CLIENT_ID, OLD_PO, NEW_PO });

const { data: payRows, error: payErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, sheet, data")
  .or(`client_key.eq.${CLIENT_KEY},client_name.ilike.%elijah%`);
if (payErr) throw new Error(payErr.message);

console.log(
  "client_payments hits:",
  (payRows || []).map((r) => ({
    id: r.id,
    key: r.client_key,
    name: r.client_name,
    sheet: r.sheet,
    po: (r.data as Record<string, unknown>)?.PO ||
      (r.data as Record<string, unknown>)?.po ||
      null,
  })),
);

const { data: contacts, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, parent_display, mobile, email",
  )
  .or("child_display.ilike.%elijah%,child_first_name.ilike.%elijah%");
if (cErr) throw new Error(cErr.message);
console.log("contacts:", contacts);

const contactIds = [...new Set((contacts || []).map((c) => String(c.contact_id)))];

const { data: shares, error: sErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, payment_method_hint, line_description, notes, share_status",
  )
  .or(
    [
      contactIds.length ? `contact_id.in.(${contactIds.join(",")})` : "contact_id.eq.__none__",
      `line_description.ilike.%${OLD_PO}%`,
      `notes.ilike.%${OLD_PO}%`,
      `line_description.ilike.%elijah%`,
    ].join(","),
  );
if (sErr) throw new Error(sErr.message);

console.log(
  "invoice shares:",
  (shares || []).map((s) => ({
    inv: s.invoice_number,
    contact: s.contact_id,
    status: s.payment_status,
    hint: s.payment_method_hint,
    hasOldPo:
      String(s.line_description || "").includes(OLD_PO) ||
      String(s.notes || "").includes(OLD_PO),
  })),
);

const { data: pos, error: poErr } = await admin
  .from("portal_purchase_orders")
  .select("id, po_number, org_id, status, notes")
  .or(`po_number.eq.${OLD_PO},po_number.eq.${NEW_PO},notes.ilike.%elijah%`);
if (poErr) console.warn("portal_purchase_orders", poErr.message);
else console.log("purchase_orders:", pos);

if (!APPLY) {
  console.log("\nDry run only. Re-run with APPLY=1");
  Deno.exit(0);
}

/* 1) client_payments */
for (const row of payRows || []) {
  const key = String(row.client_key || "").toLowerCase();
  const name = String(row.client_name || "").toLowerCase();
  if (key !== CLIENT_KEY && !name.includes("elijah")) continue;
  const data = { ...((row.data as Record<string, unknown>) || {}) };
  const before = String(data.PO || data.po || "");
  data["Client Id"] = CLIENT_ID;
  data["Client ID"] = CLIENT_ID;
  data.PO = NEW_PO;
  data.po = NEW_PO;
  const { error } = await admin.from("client_payments").update({ data }).eq("id", row.id);
  if (error) throw new Error(`client_payments ${row.id}: ${error.message}`);
  console.log("OK client_payments", row.client_key, before || "—", "→", NEW_PO);
}

/* 2) portal_purchase_orders */
for (const row of pos || []) {
  if (String(row.po_number) === OLD_PO) {
    const { error } = await admin
      .from("portal_purchase_orders")
      .update({ po_number: NEW_PO })
      .eq("id", row.id);
    if (error) throw new Error(`PO row ${row.id}: ${error.message}`);
    console.log("OK portal_purchase_orders", row.id, OLD_PO, "→", NEW_PO);
  }
}

/* 3) invoice shares + PDF regen */
let regenOk = 0;
let regenFail = 0;
for (const share of shares || []) {
  const st = String(share.payment_status || "").toLowerCase();
  if (st === "void" || st === "cancelled") {
    console.log("skip void", share.invoice_number);
    continue;
  }
  const hint = String(share.payment_method_hint || "").toLowerCase();
  const blob = `${share.line_description || ""}\n${share.notes || ""}`;
  const isElijahContact = contactIds.includes(String(share.contact_id));
  const hasOld = blob.includes(OLD_PO);
  if (!isElijahContact && !hasOld) continue;
  if (hint && hint !== "la_funded" && !hasOld) {
    console.log("skip non-LA", share.invoice_number, hint);
    continue;
  }

  let lineDescription = stripClientPoFooter(String(share.line_description || ""));
  lineDescription = replacePoInText(lineDescription, OLD_PO, NEW_PO);
  let notes = replacePoInText(String(share.notes || ""), OLD_PO, NEW_PO);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (lineDescription !== String(share.line_description || "")) {
    patch.line_description = lineDescription;
  }
  if (notes !== String(share.notes || "")) patch.notes = notes;

  if (Object.keys(patch).length > 1) {
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update(patch)
      .eq("id", share.id);
    if (error) throw new Error(`share ${share.invoice_number}: ${error.message}`);
    console.log("OK share text", share.invoice_number);
  }

  try {
    const out = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
    if (out && (out as { ok?: boolean }).ok !== false) {
      regenOk++;
      console.log("PDF OK", share.invoice_number);
    } else {
      regenFail++;
      console.warn("PDF FAIL", share.invoice_number, out);
    }
  } catch (e) {
    regenFail++;
    console.warn("PDF ERR", share.invoice_number, e);
  }
}

console.log(JSON.stringify({ regenOk, regenFail }, null, 2));
