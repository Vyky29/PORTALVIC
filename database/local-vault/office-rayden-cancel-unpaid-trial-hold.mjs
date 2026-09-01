/**
 * Rayden Rana (403) · INV-P-0370 trial — cancel unpaid pay-hold.
 * Did not pay in time / did not take the place.
 *
 *   APPLY=1 node database/local-vault/office-rayden-cancel-unpaid-trial-hold.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APPLY = process.env.APPLY === "1";
const CONTACT_ID = "403";
const INVOICE_NUMBER = "INV-P-0370";
const TOKEN_ID = "99416c3f-6f15-45f1-944b-2a09c420ea31";
const NOTE =
  "Office 1 Sep 2026 — Cancelled: unpaid trial pay-hold expired; Rayden did not take the place.";

function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(ROOT, "local-secrets/secrets.env"));

const sb = createClient(
  process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const now = new Date().toISOString();

const { data: inv, error: invErr } = await sb
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, payment_status, share_status, document_id, contact_id, amount_gbp, notes",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr) throw invErr;
if (!inv) throw new Error("INV-P-0370 not found");

const docId = String(inv.document_id || "");

const { data: reservations } = await sb
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, participant_name, service_name, venue, day_label, time_label, hold_expires_at, notes, document_id",
  )
  .or(
    `document_id.eq.${docId},participant_name.ilike.%rayden%,notes.ilike.%${INVOICE_NUMBER}%`,
  )
  .order("created_at", { ascending: false })
  .limit(10);

const { data: tokens } = await sb
  .from("portal_booking_completion_tokens")
  .select("id, status, document_id, invoice_share_id, expires_at")
  .or(`id.eq.${TOKEN_ID},document_id.eq.${docId},invoice_share_id.eq.${inv.id}`)
  .limit(10);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("invoice", {
  id: inv.id,
  payment_status: inv.payment_status,
  share_status: inv.share_status,
  amount: inv.amount_gbp,
  document_id: docId,
});
console.log(
  "reservations",
  (reservations || []).map((r) => ({
    id: r.id,
    status: r.status,
    slot: `${r.venue} ${r.day_label} ${r.time_label}`,
    hold_expires_at: r.hold_expires_at,
  })),
);
console.log(
  "tokens",
  (tokens || []).map((t) => ({
    id: t.id,
    status: t.status,
    invoice_share_id: t.invoice_share_id,
  })),
);

if (!APPLY) {
  console.log(
    "\nRe-run with APPLY=1 to void invoice, expire reservation + finish token.",
  );
  process.exit(0);
}

if (String(inv.payment_status).toLowerCase() === "paid") {
  throw new Error("refusing to cancel a paid invoice");
}

const { error: voidErr } = await sb
  .from("portal_parent_invoice_share")
  .update({
    payment_status: "void",
    share_status: "hidden",
    notes: `${String(inv.notes || "").trim()} · ${NOTE}`.trim().slice(0, 2000),
    updated_at: now,
  })
  .eq("id", inv.id);
if (voidErr) throw voidErr;
console.log("voided", INVOICE_NUMBER);

const openRes = (reservations || []).filter((r) =>
  /^(awaiting_payment|validated|held|pending)/i.test(String(r.status || "")),
);
for (const r of openRes) {
  const { error } = await sb
    .from("portal_booking_slot_reservations")
    .update({
      status: "expired",
      released_at: now,
      updated_at: now,
      notes: `${String(r.notes || "").trim()}|${NOTE}`.replace(/^\|/, "").slice(0, 500),
    })
    .eq("id", r.id);
  if (error) throw error;
  console.log("expired reservation", r.id, r.status, "→ expired");
}

for (const t of tokens || []) {
  const st = String(t.status || "").toLowerCase();
  if (
    !["awaiting_payment", "awaiting_office_payment", "choices_saved", "open"].includes(
      st,
    )
  ) {
    console.log("token already", t.id, t.status);
    continue;
  }
  const { error } = await sb
    .from("portal_booking_completion_tokens")
    .update({ status: "expired_unpaid", updated_at: now })
    .eq("id", t.id);
  if (error) throw error;
  console.log("expired token", t.id);
}

const { data: contact } = await sb
  .from("portal_parent_contacts")
  .select("contact_id, in_class, child_display")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (contact && contact.in_class !== false) {
  await sb
    .from("portal_parent_contacts")
    .update({ in_class: false, updated_at: now })
    .eq("contact_id", CONTACT_ID);
  console.log("in_class → false");
} else {
  console.log("in_class already false");
}

const { data: invAfter } = await sb
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, share_status")
  .eq("id", inv.id)
  .maybeSingle();
console.log("\nDONE", invAfter);
