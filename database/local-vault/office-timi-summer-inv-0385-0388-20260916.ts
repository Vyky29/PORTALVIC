/**
 * Timi Dairo · Summer 25/26 NHS invoices Inv 0385–0388 (Victor/Raul sheet).
 * Portal had no rows for these Xero-style numbers; INV-P-0385–0388 are H&F drafts.
 *
 *   INV-0388 Apr £250
 *   INV-0387 May £750
 *   INV-0386 Jun £3,150 (9 × £350)
 *   INV-0385 Jul £3,150 (9 × £350)
 *
 * PDF body: Client's ID NWL477032 · Reference XXPRASHERV1
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-timi-summer-inv-0385-0388-20260916.ts
 *   EMAIL=1 …  # also send PDFs to info@clubsensational.org
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const EMAIL = (Deno.env.get("EMAIL") || "") === "1";
const TO = (Deno.env.get("TO") || "info@clubsensational.org").trim();
const CONTACT_ID = "gap-timi-dairo";
const CHILD = "Timi Dairo";
const RATE = 350;
const CLIENT_ID = "477032";
const PO = "XXPRASHERV1";
const OUT = "database/local-vault/tmp/timi-summer-0385-0388";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday + Friday session dates (UTC noon). */
function monFriDates(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${startIso}T12:00:00Z`);
    d <= new Date(`${endIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const wd = d.getUTCDay();
    if (wd === 1 || wd === 5) out.push(ymd(d));
  }
  return out;
}

function fmtList(dates: string[]): string {
  return dates
    .map((iso) => {
      const d = new Date(`${iso}T12:00:00Z`);
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    })
    .join(", ");
}

const junDates = monFriDates("2026-06-01", "2026-06-30");
const julDates = monFriDates("2026-07-01", "2026-07-31");

type Plan = {
  invoiceNumber: string;
  monthLabel: string;
  reference: string;
  amount: number;
  quantity: number;
  unit: number;
  invoiceDate: string;
  dueDate: string;
  readyBy: string;
  lineItems: PortalInvoiceLineItem[];
};

const plans: Plan[] = [
  {
    invoiceNumber: "INV-0388",
    monthLabel: "April 2026",
    reference: "April 2026",
    amount: 250,
    quantity: 1,
    unit: 250,
    invoiceDate: "2026-04-30",
    dueDate: "2026-05-14",
    readyBy: "office_timi_summer_2526_nhs_inv_0388",
    lineItems: [
      {
        service_key: "DAY_CENTRE_120",
        description: "Day Centre 2h (2:1)",
        detail: "April 2026 · SwimFarm · 11:00–13:00 · 2:1 · sheet £250",
        dates: "April 2026 (Victor/Raul sheet)",
        quantity: 1,
        unit_price_gbp: 250,
        amount_gbp: 250,
        xero_item_code: null,
      },
    ],
  },
  {
    invoiceNumber: "INV-0387",
    monthLabel: "May 2026",
    reference: "May 2026",
    amount: 750,
    quantity: 1,
    unit: 750,
    invoiceDate: "2026-05-31",
    dueDate: "2026-06-14",
    readyBy: "office_timi_summer_2526_nhs_inv_0387",
    lineItems: [
      {
        service_key: "DAY_CENTRE_120",
        description: "Day Centre 2h (2:1)",
        detail: "May 2026 · SwimFarm · 11:00–13:00 · 2:1 · sheet £750",
        dates: "May 2026 (Victor/Raul sheet)",
        quantity: 1,
        unit_price_gbp: 750,
        amount_gbp: 750,
        xero_item_code: null,
      },
    ],
  },
  {
    invoiceNumber: "INV-0386",
    monthLabel: "June 2026",
    reference: "June 2026",
    amount: junDates.length * RATE,
    quantity: junDates.length,
    unit: RATE,
    invoiceDate: "2026-06-30",
    dueDate: "2026-07-14",
    readyBy: "office_timi_summer_2526_nhs_inv_0386",
    lineItems: [
      {
        service_key: "DAY_CENTRE_120",
        description: "Day Centre 2h (2:1)",
        detail: "Monday / Friday · SwimFarm · 11:00–13:00 · 2:1",
        dates: `Dates: ${fmtList(junDates)}`,
        quantity: junDates.length,
        unit_price_gbp: RATE,
        amount_gbp: junDates.length * RATE,
        xero_item_code: null,
      },
    ],
  },
  {
    invoiceNumber: "INV-0385",
    monthLabel: "July 2026",
    reference: "July 2026",
    amount: julDates.length * RATE,
    quantity: julDates.length,
    unit: RATE,
    invoiceDate: "2026-07-31",
    dueDate: "2026-08-14",
    readyBy: "office_timi_summer_2526_nhs_inv_0385",
    lineItems: [
      {
        service_key: "DAY_CENTRE_120",
        description: "Day Centre 2h (2:1)",
        detail: "Monday / Friday · SwimFarm · 11:00–13:00 · 2:1",
        dates: `Dates: ${fmtList(julDates)}`,
        quantity: julDates.length,
        unit_price_gbp: RATE,
        amount_gbp: julDates.length * RATE,
        xero_item_code: null,
      },
    ],
  },
];

console.log("Timi Summer 25/26 NHS Inv 0385–0388");
console.log("Jun dates", junDates.length, junDates.join(", "));
console.log("Jul dates", julDates.length, julDates.join(", "));
for (const p of plans) {
  console.log(p.invoiceNumber, p.monthLabel, `£${p.amount}`, `${p.quantity}×£${p.unit}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1 to create + regen PDFs.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

mkdirSync(OUT, { recursive: true });
const created: Array<{ inv: string; id: string; month: string; amount: number }> = [];

for (const p of plans) {
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, amount_gbp")
    .eq("invoice_number", p.invoiceNumber)
    .maybeSingle();

  let shareId = existing?.id ? String(existing.id) : "";

  if (existing) {
    console.log("EXISTS", p.invoiceNumber, `£${existing.amount_gbp} — regen PDF only`);
  } else {
    const description = lineItemsToDescription(p.lineItems, { fundedProvision: true });
    const createdInv = await createPortalFamilyInvoice(admin, {
      contactId: CONTACT_ID,
      amountGbp: p.amount,
      dueDateIso: p.dueDate,
      invoiceDateIso: p.invoiceDate,
      vatMode: "exempt",
      lineDescription: description,
      reference: p.reference,
      service: "Day Centre · NHS/SBS",
      notes:
        `Office NHS summer 25/26 · ${CHILD} · ${p.monthLabel} · ` +
        `sheet Inv ${p.invoiceNumber.replace("INV-", "")} · ` +
        `Client ID ${CLIENT_ID} · PO ${PO} · ${p.readyBy}`,
      title: `Invoice — ${CHILD} · Day Centre · ${p.monthLabel}`,
      shareStatus: "ready",
      paymentMethodHint: "la_funded",
      createdVia: "portal",
      ownerUserId: ownerId,
      readyBy: p.readyBy,
      invoiceNumber: p.invoiceNumber,
      clientIdLabel: CLIENT_ID,
      poLabel: PO,
      quantity: p.quantity,
      billingTerm: "summer",
      lineItems: p.lineItems,
      paymentSchedule: [
        {
          seq: 1,
          label: `${p.monthLabel} · NHS invoice`,
          due_date: p.dueDate,
          amount_gbp: p.amount,
          status: "pending",
        },
      ],
    });
    if (!createdInv.ok) {
      console.error("CREATE FAIL", p.invoiceNumber, createdInv);
      Deno.exit(1);
    }
    shareId = String(createdInv.invoice.id || "");
    if (!shareId) {
      const { data: row } = await admin
        .from("portal_parent_invoice_share")
        .select("id")
        .eq("invoice_number", createdInv.invoiceNumber)
        .maybeSingle();
      shareId = String(row?.id || "");
    }
    console.log("CREATED", createdInv.invoiceNumber, shareId);
  }

  // Ensure NHS markers + Client ID / PO on share for regen
  await admin
    .from("portal_parent_invoice_share")
    .update({
      ready_by: p.readyBy,
      reference_text: p.reference,
      notes:
        `Office NHS summer 25/26 · ${CHILD} · ${p.monthLabel} · ` +
        `Client ID ${CLIENT_ID} · PO ${PO} · ${p.readyBy}`,
      payment_method_hint: "la_funded",
      vat_mode: "exempt",
      updated_at: new Date().toISOString(),
    })
    .eq("id", shareId);

  const regen = await regeneratePortalInvoiceSharePdf(admin, shareId, { mode: "store" });
  if (!regen.ok) {
    console.error("REGEN FAIL", p.invoiceNumber, regen);
    Deno.exit(1);
  }
  const bytes = await regeneratePortalInvoiceSharePdf(admin, shareId, { mode: "bytes" });
  if (bytes.ok && "pdfBytes" in bytes) {
    writeFileSync(join(OUT, `${p.invoiceNumber}.pdf`), bytes.pdfBytes);
  }
  created.push({ inv: p.invoiceNumber, id: shareId, month: p.monthLabel, amount: p.amount });
}

console.log("PDFs →", OUT);

if (EMAIL) {
  const smtp = readParentNotifySmtpConfig();
  if (!smtp?.host) {
    console.error("SMTP missing");
    Deno.exit(1);
  }
  function bytesToBase64(b: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return btoa(bin);
  }
  const attachments = created.map((c) => {
    const raw = new Uint8Array(readFileSync(join(OUT, `${c.inv}.pdf`)));
    return {
      filename: `${c.inv}_Timi_${c.month.replace(/\s+/g, "-")}.pdf`,
      contentBase64: bytesToBase64(raw),
      mimeType: "application/pdf",
    };
  });
  const body =
    `Timi Dairo · Summer 25/26 NHS invoices (4) — Client's ID added.\n\n` +
    `Client's ID: NWL${CLIENT_ID}\n` +
    `Reference (body): ${PO}\n` +
    `Top Reference: month label.\n\n` +
    created.map((c) => `• ${c.inv} · ${c.month} · £${c.amount.toFixed(2)}`).join("\n") +
    `\n`;
  const mailFromAddr =
    (Deno.env.get("PORTAL_MAIL_FROM") || "").trim() || "admin@clubsensational.org";
  const fromHeader = mailFromAddr.includes("<")
    ? mailFromAddr
    : `clubSENsational <${mailFromAddr}>`;
  const mail = await sendEmailWithAttachmentViaSmtp({
    config: smtp,
    to: [TO],
    subject: "Timi Summer 25/26 NHS · INV-0385–0388 (Client's ID NWL477032)",
    html: plainTextToHtml(body),
    replyTo: "info@clubsensational.org",
    fromOverride: fromHeader,
    attachments,
  });
  console.log(mail);
  if (!mail.ok) Deno.exit(1);
  console.log("Emailed →", TO);
}
