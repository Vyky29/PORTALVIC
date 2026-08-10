#!/usr/bin/env node
/**
 * Void paid Portal INV-P already in Xero, clear Portal xero_* links, so Admin
 * "Push paid to Xero" recreates them with parent-PDF-style Descriptions + item codes.
 *
 *   node database/local-vault/void-paid-xero-for-repush.mjs --dry-run
 *   node database/local-vault/void-paid-xero-for-repush.mjs
 *
 * Note: after VOIDED, Xero may allocate INV-P-xxxx-R1 if the original number is locked.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const ENV_PATH = join(__dirname, "private", "parent-portal-secrets.env");
const DRY = process.argv.includes("--dry-run");
const XERO_API = "https://api.xero.com/api.xro/2.0";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function upsertEnv(path, patch) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [k, v] of Object.entries(patch)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text = text.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(path, text);
}

const env = {
  ...loadEnv(join(root, "local-secrets/secrets.env")),
  ...loadEnv(ENV_PATH),
};

const sbUrl = (env.SUPABASE_URL || env.PORTAL_SUPABASE_URL || "").replace(/\/$/, "");
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY || env.PORTAL_SUPABASE_SERVICE_ROLE_KEY || "";
const clientId = env.XERO_CLIENT_ID || "";
const clientSecret = env.XERO_CLIENT_SECRET || "";
let tenantId = env.XERO_TENANT_ID || "";
let refreshToken = env.XERO_REFRESH_TOKEN || "";

if (!sbUrl || !sbKey || !clientId || !clientSecret) {
  console.error("Missing Supabase / Xero credentials");
  process.exit(1);
}

async function sb(path, opts = {}) {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      Prefer: "return=representation",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      `supabase ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`,
    );
  }
  return json;
}

async function hydrateRefreshFromDb() {
  const rows = await sb("portal_xero_oauth?select=refresh_token,updated_at&limit=1");
  const tok = rows?.[0]?.refresh_token;
  if (tok) refreshToken = tok;
}

async function persistRefresh(next) {
  if (!next) return;
  refreshToken = next;
  upsertEnv(ENV_PATH, { XERO_REFRESH_TOKEN: next });
  await sb("portal_xero_oauth?id=eq.1", {
    method: "PATCH",
    body: JSON.stringify({ refresh_token: next, updated_at: new Date().toISOString() }),
  });
}

async function xeroAccessToken() {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `xero_auth ${res.status}: ${json.error || ""} ${json.error_description || ""}`,
    );
  }
  if (json.refresh_token) await persistRefresh(json.refresh_token);
  return String(json.access_token);
}

function xeroHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Xero-Tenant-Id": tenantId,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function getInvoice(token, id) {
  const res = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(id)}`, {
    headers: xeroHeaders(token),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: json?.Message || json?.Detail || JSON.stringify(json).slice(0, 200),
    };
  }
  const inv = (json.Invoices || [])[0] || null;
  if (!inv) return { ok: false, status: 404, detail: "not_found" };
  return {
    ok: true,
    id: String(inv.InvoiceID || id),
    number: String(inv.InvoiceNumber || ""),
    status: String(inv.Status || "").toUpperCase(),
    payments: Array.isArray(inv.Payments) ? inv.Payments : [],
    amountPaid: Number(inv.AmountPaid) || 0,
  };
}

async function deletePayment(token, paymentId) {
  const res = await fetch(`${XERO_API}/Payments/${encodeURIComponent(paymentId)}`, {
    method: "POST",
    headers: xeroHeaders(token),
    body: JSON.stringify({ Status: "DELETED" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, detail: json?.Message || JSON.stringify(json).slice(0, 240) };
  }
  return { ok: true };
}

async function setInvoiceStatus(token, invoiceId, status) {
  const res = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(invoiceId)}`, {
    method: "POST",
    headers: xeroHeaders(token),
    body: JSON.stringify({
      Invoices: [{ InvoiceID: invoiceId, Status: status }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const el = (json?.Elements || [])[0];
    const errs = (el?.ValidationErrors || []).map((e) => e.Message).filter(Boolean);
    return {
      ok: false,
      detail: errs.join("; ") || json?.Message || JSON.stringify(json).slice(0, 240),
    };
  }
  const inv = (json.Invoices || [])[0];
  return { ok: true, status: String(inv?.Status || status).toUpperCase() };
}

async function clearPortalLink(shareId) {
  return sb(`portal_parent_invoice_share?id=eq.${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({
      xero_invoice_id: null,
      xero_payment_id: null,
      xero_synced_at: null,
      xero_push_status: null,
      xero_push_error: "cleared_for_repush_parent_pdf_lines",
      updated_at: new Date().toISOString(),
    }),
  });
}

await hydrateRefreshFromDb();
if (!refreshToken || !tenantId) {
  console.error("Missing XERO_REFRESH_TOKEN / XERO_TENANT_ID");
  process.exit(1);
}

const rows = await sb(
  "portal_parent_invoice_share?xero_invoice_id=not.is.null&payment_status=eq.paid&created_via=in.(portal,reenrolment)&select=id,invoice_number,payment_status,created_via,amount_gbp,xero_invoice_id,xero_payment_id&order=invoice_number",
);

console.log(DRY ? "DRY RUN" : "LIVE", "paid targets", (rows || []).length);
for (const r of rows || []) {
  console.log(" -", r.invoice_number, "£" + r.amount_gbp, r.xero_invoice_id);
}

let token = await xeroAccessToken();
const results = [];

for (const row of rows || []) {
  const invNo = row.invoice_number;
  const xeroId = row.xero_invoice_id;
  const line = {
    invoice_number: invNo,
    portal_status: row.payment_status,
    xero_invoice_id: xeroId,
  };
  try {
    await new Promise((r) => setTimeout(r, 350));
    let inv = await getInvoice(token, xeroId);
    if (!inv.ok && inv.status === 401) {
      token = await xeroAccessToken();
      inv = await getInvoice(token, xeroId);
    }
    if (!inv.ok) {
      line.xero = "missing";
      line.action = "clear_portal_only";
      if (!DRY) await clearPortalLink(row.id);
      line.ok = true;
      results.push(line);
      console.log("OK", invNo, line.action, inv.detail || "");
      continue;
    }

    line.xero_status = inv.status;
    let finalStatus = inv.status;

    if (["VOIDED", "DELETED"].includes(inv.status)) {
      line.action = "already_gone";
    } else {
      const paymentIds = [
        ...new Set(
          [
            ...(inv.payments || []).map((p) => String(p.PaymentID || "").trim()),
            String(row.xero_payment_id || "").trim(),
          ].filter((id) => id && !id.startsWith("xero-already-paid:")),
        ),
      ];
      if (!DRY && paymentIds.length && ["PAID", "AUTHORISED"].includes(inv.status)) {
        for (const pid of paymentIds) {
          const del = await deletePayment(token, pid);
          if (!del.ok) line.payment_delete_error = del.detail;
          await new Promise((r) => setTimeout(r, 250));
        }
        inv = await getInvoice(token, xeroId);
        if (inv.ok) finalStatus = inv.status;
      }

      if (DRY) {
        line.action = finalStatus === "DRAFT" ? "would_delete" : "would_void";
        line.payments = paymentIds.length;
      } else if (finalStatus === "DRAFT") {
        const del = await setInvoiceStatus(token, xeroId, "DELETED");
        if (!del.ok) throw new Error(del.detail || "delete_failed");
        line.action = "deleted";
        line.xero_status_after = del.status;
      } else {
        const voided = await setInvoiceStatus(token, xeroId, "VOIDED");
        if (!voided.ok) throw new Error(voided.detail || "void_failed");
        line.action = "voided";
        line.xero_status_after = voided.status;
      }
    }

    if (!DRY) await clearPortalLink(row.id);
    line.ok = true;
    results.push(line);
    console.log("OK", invNo, line.action, line.xero_status || "", line.xero_status_after || "");
  } catch (e) {
    line.ok = false;
    line.error = e?.message || String(e);
    results.push(line);
    console.error("FAIL", invNo, line.error);
  }
}

const ok = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ dry: DRY, ok, fail, results }, null, 2));
if (fail) process.exit(1);
console.log(
  DRY
    ? "\nDry run only. Re-run without --dry-run, then Admin → Push paid to Xero."
    : "\nDone. Portal links cleared. Admin → Invoices → Push paid to Xero.",
);
