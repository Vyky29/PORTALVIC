/**
 * Zakariya not coming crash week 27–31 Jul:
 *  - void unpaid INV-P-0120
 *  - remove Zakariya from MADRE that week
 *  - move Yaqoub Mon/Tue/Wed 1–2 onto Roberto (was Youssef)
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-zakariya-cancel-w2-yaqoub-roberto.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const WEEK_START = "2026-07-27";
const YAQ_DATES = ["2026-07-27", "2026-07-28", "2026-07-29"];
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

const { data: inv } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, share_status, amount_gbp, notes")
  .eq("invoice_number", "INV-P-0120")
  .eq("contact_id", "42")
  .maybeSingle();
console.log(
  "INV-P-0120",
  inv
    ? `${inv.payment_status}/${inv.share_status} £${inv.amount_gbp}`
    : "missing",
);

const { data: madreRow } = await admin
  .from("portal_madre_document")
  .select("revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (!madreRow?.document) throw new Error("madre missing");
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
if (!week) throw new Error("week missing");

let yaqInfo = "";
let zakCount = 0;
let yaqOnYoussef = 0;
for (const st of week.staff || []) {
  for (const day of st.days || []) {
    const iso = String(day.sessionDate || "").slice(0, 10);
    if (!iso.startsWith("2026-07-")) continue;
    for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
      if (/^zakariya$/i.test(String(s.client_name || ""))) zakCount++;
      if (/^yaqoub$/i.test(String(s.client_name || ""))) {
        if (s.participant_info) yaqInfo = String(s.participant_info);
        if (String(st.staffKey || "").toLowerCase() === "youssef") yaqOnYoussef++;
      }
    }
  }
}
console.log({ zakCount, yaqOnYoussef, yaqInfo: !!yaqInfo });

if (!APPLY) {
  console.log("Dry run — void INV-P-0120, drop Zak W2, Yaqoub→Roberto 1–2 Mon/Tue/Wed");
  Deno.exit(0);
}

const now = new Date().toISOString();
if (inv && inv.payment_status !== "void") {
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      share_status: "hidden",
      notes:
        `${String(inv.notes || "").trim()} · VOID ${now.slice(0, 10)} — Zakariya not attending crash week 27–31 Jul.`
          .replace(/^\s·\s/, ""),
      updated_at: now,
    })
    .eq("id", inv.id);
  if (error) throw error;
  console.log("voided INV-P-0120");
} else {
  console.log("invoice already void or missing");
}

for (const st of week.staff || []) {
  for (const day of st.days || []) {
    const iso = String(day.sessionDate || "").slice(0, 10);
    if (iso < "2026-07-27" || iso > "2026-07-31") continue;
    day.slots = ((day.slots as Array<Record<string, unknown>>) || []).filter(
      (s) => {
        const n = String(s.client_name || "").toLowerCase();
        if (n === "zakariya") return false;
        if (n === "yaqoub") return false; // re-place on Roberto
        return true;
      },
    );
  }
}

const roberto = (week.staff || []).find(
  (s) => String(s.staffKey || "").toLowerCase() === "roberto",
);
if (!roberto) throw new Error("roberto missing");

for (const iso of YAQ_DATES) {
  const d = ensureDay(roberto, iso);
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
    instructors: "ROBERTO",
    participant_info: yaqInfo,
  });
  d.slots = slots;
  sortSlots(d as { slots?: Array<{ time_slot?: string }> });
}

const prevRev = Number(madreRow.revision) || 0;
const revNote =
  `rev ${prevRev + 1}: Zakariya off crash W2 (void INV-P-0120); Yaqoub Mon/Tue/Wed 1–2 → Roberto`;
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
console.log("Done.");
