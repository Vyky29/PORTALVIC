/**
 * Direct Payment / LA-exempt funding must not stay as vat_mode=vat_20.
 * Patches portal_parent_invoice_share, then optionally regenerates PDFs via edge upsert.
 *
 *   node database/local-vault/fix-dp-exempt-vat-mode.mjs          # dry run
 *   APPLY=1 node database/local-vault/fix-dp-exempt-vat-mode.mjs  # write + regen
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.env.APPLY === "1";

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "database/local-vault/private/parent-portal-secrets.env"),
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function clean(v, max = 120) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function nameKey(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, vat_mode, payment_method_hint, share_status, payment_status",
  )
  .eq("vat_mode", "vat_20")
  .neq("payment_status", "void")
  .order("invoice_number");
if (shErr) throw shErr;

const contactIds = [...new Set((shares || []).map((s) => clean(s.contact_id)).filter(Boolean))];
const { data: pax } = await admin
  .from("portal_participants")
  .select("contact_id, display_name, first_name, last_name")
  .in("contact_id", contactIds);
const nameByContact = new Map();
for (const p of pax || []) {
  const n =
    clean(p.display_name) ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    clean(p.contact_id);
  nameByContact.set(clean(p.contact_id), n);
}

const { data: payRows } = await admin
  .from("client_payments")
  .select("client_key, client_name, sheet, data")
  .in("sheet", ["DIRECT_PAYMENTS", "LA"]);

const exemptKeys = new Set();
const exemptNames = [];
for (const row of payRows || []) {
  const sheet = String(row.sheet || "").toUpperCase();
  if (sheet !== "DIRECT_PAYMENTS" && sheet !== "LA") continue;
  if (row.client_key) exemptKeys.add(String(row.client_key).toLowerCase());
  const nk = nameKey(row.client_name);
  if (nk) exemptNames.push({ nk, sheet });
}

function isExemptContact(contactId, displayName) {
  const cid = clean(contactId);
  if (exemptKeys.has(cid.toLowerCase())) return true;
  // client_key sometimes matches contact display slug
  const target = nameKey(displayName);
  if (!target) return false;
  for (const { nk } of exemptNames) {
    if (nk.length < 4) continue;
    if (target === nk || target.startsWith(nk) || nk.startsWith(target)) return true;
  }
  return false;
}

const toFix = [];
for (const s of shares || []) {
  const cid = clean(s.contact_id);
  const name = nameByContact.get(cid) || cid;
  const hint = clean(s.payment_method_hint, 40).toLowerCase();
  if (hint === "la_funded" || isExemptContact(cid, name)) {
    toFix.push({
      id: s.id,
      invoice_number: s.invoice_number,
      contact_id: cid,
      name,
      hint,
      share_status: s.share_status,
    });
  }
}

console.log(`vat_20 shares scanned: ${(shares || []).length}`);
console.log(`exempt funding mismatches: ${toFix.length}`);
console.log(toFix.map((r) => `${r.invoice_number} · ${r.name}`).join("\n"));

if (!APPLY) {
  console.log("\nDry run — set APPLY=1 to set vat_mode=exempt and regenerate ready PDFs.");
  process.exit(0);
}

for (const row of toFix) {
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({ vat_mode: "exempt", updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    console.error("update failed", row.invoice_number, error.message);
    continue;
  }
  console.log("patched", row.invoice_number);
}

// Regen via admin function if available locally — call shared path through Deno script instead.
const anon = readEnv("SUPABASE_ANON_KEY") || readEnv("SUPABASE_PUBLISHABLE_KEY");
const adminJwt = readEnv("PORTAL_ADMIN_JWT") || readEnv("SUPABASE_ADMIN_USER_JWT");
if (!anon || !adminJwt) {
  console.log(
    "\nvat_mode patched. Skip PDF regen (need SUPABASE_ANON_KEY + PORTAL_ADMIN_JWT) — deploy upsert then re-open/regen from admin, or run Deno regen script.",
  );
  process.exit(0);
}

for (const row of toFix) {
  if (row.share_status !== "ready") continue;
  const res = await fetch(`${url}/functions/v1/portal-admin-parent-invoices-upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminJwt}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "regenerate_pdf", invoice_id: row.id }),
  });
  const text = await res.text();
  console.log("regen", row.invoice_number, res.status, text.slice(0, 160));
}
