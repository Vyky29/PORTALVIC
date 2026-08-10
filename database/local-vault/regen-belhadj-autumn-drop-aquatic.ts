/**
 * Regenerate Eiji (39) + Hazem (40) Autumn INV-Ps from the latest re-enrolment
 * submission (aquatic withdrawn → Climb + Multi only). Updates keeper + hidden
 * payment trackers, PDFs, and re-pushes keepers to Xero (void old ACCREC first).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/regen-belhadj-autumn-drop-aquatic.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/regen-belhadj-autumn-drop-aquatic.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import { unitPriceFor, type ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import type { PortalInvoiceVatMode } from "../../supabase/functions/_shared/portal_tax_invoice_pdf.ts";
import { xeroConfigured, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_IDS = ["39", "40"] as const;
const XERO_API = "https://api.xero.com/api.xro/2.0";

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

function secret(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function linesTotal(lines: PortalInvoiceLineItem[]): number {
  return round2(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
}

const SLOT_PRICE_OVERRIDES: Record<string, Array<{ match: RegExp; unit: number }>> = {
  "39": [{ match: /MULTI|S&C|MA/i, unit: 120 }],
};

function pricedSlots(contactId: string, slots: ParsedSlot[]): ParsedSlot[] {
  const overrides = SLOT_PRICE_OVERRIDES[contactId] || [];
  return slots.map((slot) => {
    if (!slot || slot.isDayCentre) return slot;
    const override = overrides.find((rule) => rule.match.test(String(slot.serviceType || "")));
    const unit = override?.unit ??
      (Number(slot.pricePerSession) > 0
        ? Number(slot.pricePerSession)
        : unitPriceFor(slot.serviceType || "", slot.durationMin || 30));
    if (!Number.isFinite(unit) || unit <= 0) return slot;
    const sessions = slot.sessions || { autumn: 0, spring: 0, summer: 0, annual: 0 };
    return {
      ...slot,
      pricePerSession: Number(unit),
      termTotals: {
        autumn: round2(Number(sessions.autumn || 0) * Number(unit)),
        spring: round2(Number(sessions.spring || 0) * Number(unit)),
        summer: round2(Number(sessions.summer || 0) * Number(unit)),
        annual: round2(Number(sessions.annual || 0) * Number(unit)),
      },
    };
  });
}

function instalmentLines(
  termLines: PortalInvoiceLineItem[],
  k: number,
): PortalInvoiceLineItem[] {
  const out = termLines.map((l) => {
    const amount = round2(l.amount_gbp / k);
    const qty = Math.max(0.01, round2(l.quantity / k));
    return {
      ...l,
      quantity: qty,
      amount_gbp: amount,
      unit_price_gbp: round4(amount / qty),
    };
  });
  const wantTotal = round2(linesTotal(termLines) / k);
  const diff = round2(wantTotal - linesTotal(out));
  if (Math.abs(diff) >= 0.01 && out.length) {
    const big = out.reduce((a, b) => (a.amount_gbp >= b.amount_gbp ? a : b));
    big.amount_gbp = round2(big.amount_gbp + diff);
    big.unit_price_gbp = round4(big.amount_gbp / big.quantity);
  }
  return out;
}

async function voidXeroInvoice(xeroInvoiceId: string): Promise<{ ok: boolean; detail?: string }> {
  const token = await xeroAccessToken();
  if (!token) return { ok: false, detail: "xero_auth_failed" };
  const res = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(xeroInvoiceId)}`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify({
      InvoiceID: xeroInvoiceId,
      Status: "VOIDED",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = JSON.stringify(json?.Elements?.[0]?.ValidationErrors || json).slice(0, 400);
    return { ok: false, detail: `${res.status} ${msg}` };
  }
  return { ok: true };
}

type ShareRow = {
  id: string;
  invoice_number: string;
  contact_id: string;
  amount_gbp: number;
  amount_paid_gbp: number;
  payment_status: string;
  share_status: string;
  vat_mode: string | null;
  reference_text: string | null;
  payment_schedule: unknown;
  line_items: unknown;
  xero_invoice_id: string | null;
  stripe_checkout_session_id: string | null;
  notes: string | null;
  created_at: string;
};

for (const contactId of CONTACT_IDS) {
  const { data: subs, error: subErr } = await admin
    .from("portal_re_enrolment_submissions")
    .select("submitted_at, payload")
    .eq("participant_contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  if (subErr) throw subErr;
  const payload = subs?.[0]?.payload as Record<string, unknown> | undefined;
  if (!payload) {
    console.log(`c${contactId}: no submission — skip`);
    continue;
  }
  const slots = Array.isArray(payload.weekly_slots_snapshot)
    ? (payload.weekly_slots_snapshot as ParsedSlot[])
    : [];
  const choices = payload.choices as Record<string, unknown> | undefined;
  const weeklyChoices =
    choices?.weekly && typeof choices.weekly === "object"
      ? (choices.weekly as Record<string, { choice?: string }>)
      : null;

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const slot of slots) {
    if (!slot || slot.isDayCentre) continue;
    const id = String(slot.id || "");
    const choice = id && weeklyChoices?.[id]
      ? String(weeklyChoices[id].choice || "keep").toLowerCase()
      : "keep";
    const label =
      `${slot.serviceType || slot.raw || "?"} · ${slot.day || "?"} ${slot.timeSlot || ""}`.trim();
    if (choice === "withdraw") dropped.push(label);
    else kept.push(label);
  }

  const { data: shares, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id,invoice_number,contact_id,amount_gbp,amount_paid_gbp,payment_status,share_status,vat_mode,reference_text,payment_schedule,line_items,xero_invoice_id,stripe_checkout_session_id,notes,created_at",
    )
    .eq("contact_id", contactId)
    .eq("created_via", "reenrolment")
    .neq("payment_status", "void")
    .order("created_at", { ascending: true });
  if (shareErr) throw shareErr;
  const rows = (shares || []) as ShareRow[];
  const autumn = rows.filter((r) =>
    /autumn/i.test(`${r.reference_text || ""} ${r.share_status}`)
  );
  if (!autumn.length) {
    console.log(`c${contactId}: no autumn invoices`);
    continue;
  }

  for (const row of autumn) {
    if (String(row.payment_status) !== "unpaid") {
      throw new Error(`${row.invoice_number}: not unpaid (${row.payment_status})`);
    }
    if (Number(row.amount_paid_gbp || 0) !== 0) {
      throw new Error(`${row.invoice_number}: has payments`);
    }
    if (row.stripe_checkout_session_id) {
      throw new Error(`${row.invoice_number}: Stripe checkout exists`);
    }
  }

  const productMap = await loadProductMap(admin);
  const vatMode: PortalInvoiceVatMode =
    String(autumn[0].vat_mode || "").toLowerCase() === "exempt" ? "exempt" : "vat_20";
  const termLines = buildReenrolTermLineItems({
    slots: pricedSlots(contactId, slots),
    weeklyChoices,
    term: "autumn",
    vatMode,
    productMap,
  });
  const termTotal = linesTotal(termLines);
  const keepers = autumn.filter((r) => r.share_status === "ready");
  const trackers = autumn.filter((r) => r.share_status === "hidden");
  const scheduleSource = keepers[0];
  const oldSchedule = Array.isArray(scheduleSource?.payment_schedule)
    ? (scheduleSource!.payment_schedule as Array<Record<string, unknown>>)
    : [];
  const k = Math.max(1, oldSchedule.length || (trackers.length + 1));
  const slice = round2(termTotal / k);
  const perInstalmentLines = instalmentLines(termLines, k);
  const newSchedule = oldSchedule.map((row, idx) => ({
    ...row,
    amount_gbp: slice,
    // keep seq/label/due/status
    seq: row.seq ?? idx + 1,
  }));
  const description = lineItemsToDescription(termLines, {
    fundedProvision: vatMode === "exempt",
  });

  console.log(`\n=== contact ${contactId} · submitted ${subs?.[0]?.submitted_at} ===`);
  console.log("KEPT:", kept.join(" | ") || "(none)");
  console.log("DROP:", dropped.join(" | ") || "(none)");
  console.log(
    `Autumn lines £${termTotal}:`,
    termLines.map((l) => `${l.description} ×${l.quantity} @£${l.unit_price_gbp}=£${l.amount_gbp}`).join(
      " · ",
    ),
  );
  console.log(`Instalments: ${k} × £${slice} (was £${oldSchedule[0]?.amount_gbp ?? "?"})`);
  console.log(
    "Invoices:",
    autumn.map((r) => `${r.invoice_number} ${r.share_status} £${r.amount_gbp}`).join(", "),
  );

  if (!APPLY) continue;

  // Update keeper(s)
  for (const row of keepers) {
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        amount_gbp: termTotal,
        unit_price_gbp: termTotal,
        quantity: 1,
        line_items: termLines,
        line_description: description,
        payment_schedule: newSchedule,
        next_instalment_due: newSchedule.find((s) => s.status === "pending")?.due_date ||
          newSchedule[0]?.due_date ||
          null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`${row.invoice_number}: ${upErr.message}`);

    const regen = await regeneratePortalInvoiceSharePdf(admin, row.id);
    if (!regen.ok) throw new Error(`${row.invoice_number}: PDF ${regen.error}`);
    console.log(`${row.invoice_number}: keeper → £${termTotal} + PDF`);

    // Xero: void old ACCREC then clear link and re-push
    if (row.xero_invoice_id && xeroConfigured()) {
      await xeroHydrateRefreshFromDb(admin);
      const voided = await voidXeroInvoice(String(row.xero_invoice_id));
      await xeroPersistRefreshToDb(admin);
      if (!voided.ok) {
        console.log(`  Xero void failed (${voided.detail}) — clearing link for manual re-push`);
      } else {
        console.log(`  Xero voided ${row.xero_invoice_id}`);
      }
      await admin
        .from("portal_parent_invoice_share")
        .update({
          xero_invoice_id: null,
          xero_payment_id: null,
          xero_push_status: null,
          xero_push_error: voided.ok ? "repush_after_aquatic_drop" : `void_failed:${voided.detail}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (voided.ok) {
        const pushed = await pushPortalInvoiceShareToXero(admin, row.id);
        console.log(`  Xero push:`, pushed);
      }
    }
  }

  // Update hidden payment trackers to the new instalment amount
  for (const row of trackers) {
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        amount_gbp: slice,
        unit_price_gbp: slice,
        quantity: 1,
        line_items: perInstalmentLines,
        line_description: description,
        payment_schedule: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`${row.invoice_number}: ${upErr.message}`);
    const regen = await regeneratePortalInvoiceSharePdf(admin, row.id);
    if (!regen.ok) {
      console.log(`${row.invoice_number}: tracker PDF warn ${regen.error}`);
    } else {
      console.log(`${row.invoice_number}: tracker → £${slice} + PDF`);
    }
  }
}

console.log(APPLY ? "\nDone." : "\nDry run only — re-run with APPLY=1 to write.");
