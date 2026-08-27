/**
 * Clear unused Stripe checkout links for INV-P-0116 / 0132 / 0115.
 * Expires open Checkout sessions in Stripe, then nulls portal link fields.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-clear-unused-stripe-links-aug15.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBERS = ["INV-P-0116", "INV-P-0132", "INV-P-0115"];

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const stripeKey = String(Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function stripeExpireSession(sessionId: string): Promise<{ ok: boolean; detail: string }> {
  if (!sessionId || !stripeKey) return { ok: false, detail: "missing" };
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const body = await res.json();
  if (res.ok) return { ok: true, detail: String(body.status || "expired") };
  // Already complete/expired is fine
  const msg = String(body?.error?.message || `http_${res.status}`);
  if (/already|expired|complete/i.test(msg)) return { ok: true, detail: msg };
  return { ok: false, detail: msg };
}

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, amount_gbp, amount_paid_gbp, payment_method_hint, payment_link_url, stripe_checkout_session_id, payment_link_surcharge_note, notes",
  )
  .in("invoice_number", INVOICE_NUMBERS);

if (error) {
  console.error(error);
  Deno.exit(1);
}

console.log("APPLY=", APPLY, "rows=", (rows || []).length);

for (const row of rows || []) {
  const sessionId = String(row.stripe_checkout_session_id || "").trim();
  console.log("\n→", row.invoice_number, {
    status: row.payment_status,
    paid: row.amount_paid_gbp,
    method: row.payment_method_hint,
    session: sessionId || null,
    has_url: !!row.payment_link_url,
  });

  if (sessionId) {
    const exp = await stripeExpireSession(sessionId);
    console.log("  stripe expire:", exp);
  }

  // Vithura paid bank → bank_transfer. Emani partial bank → bank_transfer.
  // Jack was payment_link only; after clearing unused Stripe, bank_transfer
  // (soft hold / due Aug 29 — parent can request a new link later).
  const nextHint =
    row.invoice_number === "INV-P-0115" && row.payment_method_hint === "payment_link"
      ? "bank_transfer"
      : row.payment_method_hint;

  const noteLine =
    `Office ${new Date().toISOString().slice(0, 10)}: cleared unused Stripe checkout (open/unpaid session from 15 Aug).`;
  const notes = [String(row.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 4000);

  const patch: Record<string, unknown> = {
    stripe_checkout_session_id: null,
    payment_link_url: null,
    payment_link_surcharge_note: null,
    payment_method_hint: nextHint,
    notes,
    updated_at: new Date().toISOString(),
  };

  if (!APPLY) {
    console.log("  dry-run patch:", patch);
    continue;
  }

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", row.id);
  if (upErr) {
    console.error("  update failed", upErr);
    Deno.exit(1);
  }
  console.log("  cleared");
}

console.log(APPLY ? "\ndone" : "\ndry-run only — re-run with APPLY=1");
