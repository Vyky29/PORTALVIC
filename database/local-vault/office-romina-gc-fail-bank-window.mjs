/**
 * Open GC-fail 2h bank windows for Romina Banjo (Bediako + Cayra) Sep fails.
 * Sends one WhatsApp with both amounts (idempotent if already notified).
 *
 *   node database/local-vault/office-romina-gc-fail-bank-window.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;

// Invoke the shared logic via deployed webhook path is heavy; call Edge Function cron? No —
// POST to a one-shot by importing is Deno-only. Use HTTP to a tiny invoke:
// Re-run fail handler by calling the grace helper through supabase edge is not exposed.
// Instead: call parent-portal path — simplest is fetch our new maintenance after inserting via
// the same batch through a temporary edge invoke of handleGcPaymentsFailedBatch.
// Deployed function: use portal-admin with service role by POSTing to a synthetic endpoint.
// Practical: call the GC fail batch by deploying then using deno run of the shared module.

const payments = [
  {
    paymentId: "PM01XR0V4GN2JVD6MZMA97793HBF",
    invoiceShareId: "c133bee7-a867-4b64-b4e9-4f82bdd1f692",
    cause: "refer_to_payer",
  },
  {
    paymentId: "PM01XR0V4H2824JPCRFN7DXE3KVH",
    invoiceShareId: "312e6baa-fe08-42c3-999f-71955cb69174",
    cause: "refer_to_payer",
  },
];

// Call edge function that wraps the batch — we add a POST action on the cron function
// for office bootstrap: { action: "open_fail_batch", events: [...] }
const res = await fetch(`${url}/functions/v1/portal-cron-gocardless-fail-grace`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/json",
    "x-portal-webhook-secret": process.env.PORTAL_PUSH_WEBHOOK_SECRET || "",
  },
  body: JSON.stringify({ action: "open_fail_batch", events: payments }),
});
const body = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(body, null, 2));
if (!res.ok) process.exit(1);
