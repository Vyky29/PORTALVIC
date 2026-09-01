/**
 * Update H&F LA Purchase Order numbers on client_payments and regenerate
 * all live (non-void) la_funded invoice PDFs so the new PO prints.
 *
 * Mapping (Jul 2026 sheet):
 *   Adam Pilcher     · 70416281 · FW10561494
 *   Saaib Abdullah   · 2741139  · 9005705437
 *   Simon Yohannes   · 2633551  · 9005737675  (already seeded — reaffirm)
 *   Faris Lobinet    · 2399946  · 9005739631
 *   Ibrahim Yusuf    · 2396503  · 9005711782  (NOT in portal — skipped)
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-hf-new-po-regen-invoices.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-hf-new-po-regen-invoices.ts
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
  Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("PORTAL_SUPABASE_URL") ||
    "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Target = {
  clientKey: string;
  contactId: string;
  name: string;
  clientId: string;
  po: string;
  oldPoHint?: string;
};

const TARGETS: Target[] = [
  {
    clientKey: "adam-p",
    contactId: "354",
    name: "Adam Pilcher",
    clientId: "70416281",
    po: "FW10561494",
    oldPoHint: "FW10559270",
  },
  {
    clientKey: "saiib",
    contactId: "gap-saaib-abdullah",
    name: "Saaib Abdullah",
    clientId: "2741139",
    po: "9005705437",
    oldPoHint: "9005637570",
  },
  {
    clientKey: "simon",
    contactId: "396",
    name: "Simon Yohannes",
    clientId: "2633551",
    po: "9005737675",
    oldPoHint: "9005737675",
  },
  {
    clientKey: "faris",
    contactId: "209",
    name: "Faris Lobinet",
    clientId: "2399946",
    po: "9005739631",
    oldPoHint: "9005737675",
  },
];

const MISSING = [
  {
    name: "Ibrahim Yusuf",
    clientId: "2396503",
    po: "9005711782",
    reason: "No portal_participants / LA client_payments row found",
  },
];

/** Strip stale Client ID / PO footer so regenerate rebuilds from funding. */
function stripClientPoFooter(desc: string): string {
  const raw = String(desc || "");
  const cut = raw.search(/\n\s*Client\s+ID\s*:/i);
  if (cut >= 0) return raw.slice(0, cut).trimEnd();
  const cutPo = raw.search(/\n\s*PO\s*:/i);
  if (cutPo >= 0) return raw.slice(0, cutPo).trimEnd();
  return raw;
}

function replacePoInText(text: string, oldPo: string | undefined, newPo: string): string {
  let out = String(text || "");
  if (oldPo && oldPo !== newPo) {
    out = out.split(oldPo).join(newPo);
  }
  out = out.replace(/(PO\s*:\s*)([^\n\r]+)/gi, `$1${newPo}`);
  return out;
}

console.log("H&F new POs —", APPLY ? "APPLY" : "DRY RUN");
console.log("Missing (skipped):", MISSING);

const { data: payRows, error: payErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, data")
  .eq("sheet", "LA")
  .in(
    "client_key",
    TARGETS.map((t) => t.clientKey),
  );
if (payErr) {
  console.error("client_payments", payErr.message);
  Deno.exit(1);
}

const payByKey = new Map(
  (payRows || []).map((r) => [String(r.client_key || ""), r]),
);

for (const t of TARGETS) {
  const row = payByKey.get(t.clientKey);
  if (!row) {
    console.warn("NO client_payments row for", t.clientKey, t.name);
    continue;
  }
  const data = { ...((row.data as Record<string, unknown>) || {}) };
  const before = String(data.PO || data.po || "");
  data["Client Id"] = t.clientId;
  data["Client ID"] = t.clientId;
  data.PO = t.po;
  data.po = t.po;
  console.log("seed", t.clientKey, t.name, before || "—", "→", t.po);
  if (APPLY) {
    const { error } = await admin
      .from("client_payments")
      .update({ data })
      .eq("id", row.id);
    if (error) {
      console.error("seed fail", t.clientKey, error.message);
      Deno.exit(1);
    }
  }
}

const contactIds = TARGETS.map((t) => t.contactId);
const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, payment_method_hint, line_description, notes",
  )
  .in("contact_id", contactIds)
  .neq("payment_status", "void");
if (shErr) {
  console.error("shares", shErr.message);
  Deno.exit(1);
}

const byContact = new Map(TARGETS.map((t) => [t.contactId, t]));
let regenOk = 0;
let regenFail = 0;

for (const share of shares || []) {
  const t = byContact.get(String(share.contact_id));
  if (!t) continue;
  const hint = String(share.payment_method_hint || "");
  if (hint && hint !== "la_funded") {
    console.log("skip non-LA", share.invoice_number, hint);
    continue;
  }

  let lineDescription = stripClientPoFooter(String(share.line_description || ""));
  lineDescription = replacePoInText(lineDescription, t.oldPoHint, t.po);
  let notes = replacePoInText(String(share.notes || ""), t.oldPoHint, t.po);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (lineDescription !== String(share.line_description || "")) {
    patch.line_description = lineDescription || null;
  }
  if (notes !== String(share.notes || "")) {
    patch.notes = notes || null;
  }

  console.log(
    "regen",
    share.invoice_number,
    t.name,
    "po",
    t.po,
    Object.keys(patch).length > 1 ? "(desc/notes patched)" : "",
  );

  if (!APPLY) continue;

  if (Object.keys(patch).length > 1) {
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update(patch)
      .eq("id", share.id);
    if (upErr) {
      console.error("share patch", share.invoice_number, upErr.message);
      regenFail += 1;
      continue;
    }
  }

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  if (!pdf?.ok) {
    console.error("pdf fail", share.invoice_number, pdf);
    regenFail += 1;
  } else {
    console.log("pdf ok", share.invoice_number, pdf.pdfStoragePath);
    regenOk += 1;
  }
}

console.log(
  APPLY
    ? `Done. PDFs ok=${regenOk} fail=${regenFail}. Skipped: Ibrahim Yusuf (not in portal).`
    : `Dry run. Would seed ${TARGETS.length} LA rows and regen ${(shares || []).length} live invoices. Re-run with APPLY=1.`,
);
