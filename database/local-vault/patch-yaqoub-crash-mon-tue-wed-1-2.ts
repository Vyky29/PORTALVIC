/**
 * Yaqoub crash week: Mon/Wed/Fri 12–1 → Mon/Tue/Wed 1–2.
 * Patches INV-P-0118, portal crash booking lines, and MADRE summer-2026.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-yaqoub-crash-mon-tue-wed-1-2.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "169";
const INVOICE = "INV-P-0118";
const BOOKING_ID = "fe0f4db1-f814-42b6-8d81-49497c84bf4b";
const DATES = ["2026-07-27", "2026-07-28", "2026-07-29"]; // Mon Tue Wed
const DROP_DATE = "2026-07-31"; // Fri
const SLOT_LABEL = "13:00–14:00 · SwimFarm · 1 instructor";
/** Distinct from Tinashe office_sf_1300 (13:00–13:30) — unique on activity+date+slot_id. */
const SLOT_ID = "office_yaqoub_sf_1300";
const WEEK_START = "2026-07-27";
const WD: Record<string, string> = {
  "2026-07-27": "Monday",
  "2026-07-28": "Tuesday",
  "2026-07-29": "Wednesday",
  "2026-07-30": "Thursday",
  "2026-07-31": "Friday",
};

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
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function sortSlots(day: { slots?: Array<{ time_slot?: string }> }) {
  const rank = (t: string) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + mi;
  };
  day.slots = Array.isArray(day.slots) ? day.slots : [];
  day.slots.sort((a, b) => rank(String(a.time_slot)) - rank(String(b.time_slot)));
}

function ensureDay(
  st: { days?: Array<Record<string, unknown>> },
  iso: string,
) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  if (d) return d;
  d = { weekday: WD[iso], sessionDate: iso, slots: [] };
  st.days.push(d);
  return d;
}

const { data: share, error: shareErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, payment_status, line_items, notes, line_description",
  )
  .eq("invoice_number", INVOICE)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (shareErr || !share) {
  console.error("invoice missing", shareErr);
  Deno.exit(1);
}

const productMap = await loadProductMap(admin);
const mapRow = productMap.get("AQUATIC_60");
const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_60",
    description: "Aquatic Activity 60' (1to1)",
    detail: "Summer crash course Jul 2026 — Mon 27th, Tue 28th, Wed 29th",
    dates: "1pm to 2pm · SwimFarm",
    quantity: 3,
    unit_price_gbp: 125,
    amount_gbp: 375,
    xero_item_code: xeroItemCodeForService(mapRow, "exempt"),
  },
];
const description = lineItemsToDescription(lineItems, { fundedProvision: true });
const notes =
  "Office crash course · SwimFarm aquatic 60' · Mon 27 / Tue 28 / Wed 29 Jul 2026 · 1pm–2pm · £125/session · EXEMPT VAT. (Days moved from Mon/Wed/Fri 12–1.)";

console.log("Invoice", share.invoice_number, share.payment_status, "£" + share.amount_gbp);
console.log("→", lineItems[0].detail, "·", lineItems[0].dates);

const { data: bookingLines } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, session_date, slot_label, slot_id")
  .eq("booking_id", BOOKING_ID)
  .order("session_date");
console.log("Booking lines now:", bookingLines);

const { data: madreRow } = await admin
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (!madreRow?.document) {
  console.error("madre missing");
  Deno.exit(1);
}
const doc = madreRow.document as {
  weeks?: Array<Record<string, unknown>>;
  revisionNotes?: string[];
};
const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
) as
  | {
      staff?: Array<{
        staffKey?: string;
        days?: Array<Record<string, unknown>>;
      }>;
    }
  | undefined;
if (!week) {
  console.error("week missing");
  Deno.exit(1);
}

let yaqoubInfo = "";
for (const st of week.staff || []) {
  for (const day of st.days || []) {
    for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
      if (/^yaqoub$/i.test(String(s.client_name || "")) && s.participant_info) {
        yaqoubInfo = String(s.participant_info);
      }
    }
  }
}

console.log(
  "MADRE: remove Yaqoub from Roberto Fri/old slots; add Youssef Mon/Tue/Wed 1–2 (Roberto has Zakariya 1–2 Mon/Wed)",
);

if (!APPLY) {
  console.log("Dry run — re-run with APPLY=1");
  Deno.exit(0);
}

const now = new Date().toISOString();

const { error: upInv } = await admin
  .from("portal_parent_invoice_share")
  .update({
    line_items: lineItems,
    line_description: description,
    notes,
    updated_at: now,
  })
  .eq("id", share.id);
if (upInv) throw upInv;

const bookingNotes =
  "Office inject · Yaqoub Ismail · SwimFarm aquatic 60' · Mon 27 / Tue 28 / Wed 29 Jul 2026 · 13:00–14:00 · bill Obah Yusuf INV-P-0118";
await admin
  .from("portal_crash_summer_bookings")
  .update({ notes: bookingNotes, updated_at: now })
  .eq("id", BOOKING_ID);

await admin
  .from("portal_crash_summer_booking_lines")
  .delete()
  .eq("booking_id", BOOKING_ID)
  .eq("session_date", DROP_DATE);

for (const iso of DATES) {
  const existing = (bookingLines || []).find(
    (l) => String(l.session_date).slice(0, 10) === iso,
  );
  if (existing) {
    const { error } = await admin
      .from("portal_crash_summer_booking_lines")
      .update({
        slot_id: SLOT_ID,
        slot_label: SLOT_LABEL,
      })
      .eq("id", existing.id);
    if (error) throw error;
    console.log("line updated", iso);
  } else {
    const { error } = await admin.from("portal_crash_summer_booking_lines").insert({
      booking_id: BOOKING_ID,
      activity: "swimming",
      session_date: iso,
      slot_id: SLOT_ID,
      slot_label: SLOT_LABEL,
      unit_price_gbp: 125,
      status: "awaiting_payment",
      hold_expires_at: "2026-08-05T17:00:00.000Z",
    });
    if (error) throw error;
    console.log("line inserted", iso);
  }
}

/* MADRE: strip Yaqoub from all staff that week, then place on Youssef 1–2. */
for (const st of week.staff || []) {
  for (const day of st.days || []) {
    const iso = String(day.sessionDate || "").slice(0, 10);
    if (!iso.startsWith("2026-07-")) continue;
    const slots = ((day.slots as Array<Record<string, unknown>>) || []).filter(
      (s) => !/^yaqoub$/i.test(String(s.client_name || "")),
    );
    day.slots = slots;
  }
}

const youssef = (week.staff || []).find(
  (s) => String(s.staffKey || "").toLowerCase() === "youssef",
);
if (!youssef) throw new Error("youssef missing on week");

for (const iso of DATES) {
  const d = ensureDay(youssef, iso);
  const slots = ((d.slots as Array<Record<string, unknown>>) || []).filter(
    (s) => !/^yaqoub$/i.test(String(s.client_name || "")),
  );
  slots.push({
    area: "Big Pool",
    venue: "SwimFarm",
    service: "Aquatic Activity",
    pool_note: "Big Pool",
    time_slot: "1 to 2",
    client_name: "Yaqoub",
    instructors: "YOUSSEF",
    participant_info: yaqoubInfo,
  });
  d.slots = slots;
  sortSlots(d as { slots?: Array<{ time_slot?: string }> });
}

const prevRev = Number(madreRow.revision) || 0;
const revNote =
  `rev ${prevRev + 1}: Yaqoub crash → Mon/Tue/Wed 1–2 Youssef (was Mon/Wed/Fri 12–1 Roberto; Roberto keeps Zak 1–2)`;
doc.revisionNotes = Array.isArray(doc.revisionNotes)
  ? [...doc.revisionNotes, revNote]
  : [revNote];

const { error: madreErr } = await admin
  .from("portal_madre_document")
  .update({
    document: doc,
    revision: prevRev + 1,
    updated_at: now,
  })
  .eq("term_key", "summer-2026");
if (madreErr) throw madreErr;
console.log("MADRE", revNote);

const pdf = await regeneratePortalInvoiceSharePdf(admin, share.id);
console.log("PDF", pdf);
console.log("Done.");
