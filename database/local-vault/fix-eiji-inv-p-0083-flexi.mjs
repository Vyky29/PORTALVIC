#!/usr/bin/env node
/**
 * Eiji (contact 39): keep only INV-P-0083, convert to Flexi (2 per term),
 * fix Multi-Activity line detail + dates, void orphan instalment INV-Ps.
 *
 *   node database/local-vault/fix-eiji-inv-p-0083-flexi.mjs
 *   APPLY=1 node database/local-vault/fix-eiji-inv-p-0083-flexi.mjs
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const APPLY = process.env.APPLY === "1";

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

const env = {
  ...loadEnv(join(root, "local-secrets/secrets.env")),
  ...loadEnv(join(__dirname, "private/parent-portal-secrets.env")),
};
const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

async function sb(path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
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
  if (!res.ok) throw new Error(`${res.status} ${typeof json === "string" ? json : JSON.stringify(json)}`);
  return json;
}

const CLIMB_DATES =
  "Dates: 6, 13, 20, 27 Sept; 4, 11, 18 Oct; 8, 15, 22, 29 Nov; 6, 13 Dec";
// Multi = 14 autumn Sundays (same window as climbing + one extra session week).
const MULTI_DATES =
  "Dates: 6, 13, 20, 27 Sept; 4, 11, 18 Oct; 1, 8, 15, 22, 29 Nov; 6, 13 Dec";

const rows = await sb(
  "portal_parent_invoice_share?contact_id=eq.39&invoice_number=in.(INV-P-0083,INV-P-0084,INV-P-0085,INV-P-0086)&select=id,invoice_number,amount_gbp,payment_status,share_status,payment_schedule,line_items,due_date,xero_invoice_id,document_id",
);
if (!Array.isArray(rows) || !rows.length) {
  console.error("No Eiji INV-P-0083..86 rows");
  process.exit(1);
}

const keeper = rows.find((r) => r.invoice_number === "INV-P-0083");
const orphans = rows.filter((r) => r.invoice_number !== "INV-P-0083");
if (!keeper) {
  console.error("INV-P-0083 missing");
  process.exit(1);
}

const lineItems = (Array.isArray(keeper.line_items) ? keeper.line_items : []).map((ln) => {
  const desc = String(ln.description || "");
  if (/multi/i.test(desc) || /MULTI/i.test(String(ln.service_key || ""))) {
    return {
      ...ln,
      detail: "Sunday 11 to 12.30 pm",
      dates: MULTI_DATES,
    };
  }
  if (/climb/i.test(desc) || /CLIMB/i.test(String(ln.service_key || ""))) {
    return {
      ...ln,
      detail: String(ln.detail || "Sunday 10 to 11 am").replace(/^Activity.*/i, "Sunday 10 to 11 am"),
      dates: ln.dates || CLIMB_DATES,
    };
  }
  return ln;
});

const half = Math.round((Number(keeper.amount_gbp) / 2) * 100) / 100;
const flexiSchedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    status: "pending",
    paid_at: null,
    due_date: "2026-08-15",
    paid_via: null,
    amount_gbp: half,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    status: "pending",
    paid_at: null,
    due_date: "2026-10-26",
    paid_via: null,
    amount_gbp: Math.round((Number(keeper.amount_gbp) - half) * 100) / 100,
  },
];

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("keeper", keeper.invoice_number, "£" + keeper.amount_gbp);
console.log("flexi", flexiSchedule);
console.log(
  "lines",
  lineItems.map((l) => ({ d: l.description, detail: l.detail, dates: l.dates })),
);
console.log(
  "void orphans",
  orphans.map((o) => o.invoice_number),
);

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to write.");
  process.exit(0);
}

const now = new Date().toISOString();
await sb(`portal_parent_invoice_share?id=eq.${keeper.id}`, {
  method: "PATCH",
  body: JSON.stringify({
    line_items: lineItems,
    payment_schedule: flexiSchedule,
    due_date: flexiSchedule[0].due_date,
    next_instalment_due: flexiSchedule[0].due_date,
    notes: "Flexi term — 2 payments (bank transfer). Orphan monthly trackers voided.",
    updated_at: now,
  }),
});
console.log("Updated INV-P-0083");

for (const o of orphans) {
  await sb(`portal_parent_invoice_share?id=eq.${o.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      payment_status: "void",
      share_status: "hidden",
      xero_invoice_id: null,
      xero_payment_id: null,
      xero_push_status: null,
      xero_push_error: "voided_orphan_instalment_tracker",
      notes: `Voided — instalment tracker of ${keeper.invoice_number} (flexi bank; single term invoice only)`,
      updated_at: now,
    }),
  });
  console.log("Voided", o.invoice_number);
}

console.log("\nDone. Regenerate PDF for INV-P-0083 from admin if needed.");
