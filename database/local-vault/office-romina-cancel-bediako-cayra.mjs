/**
 * Romina Banjo — cancel Autumn 2026/27 places for Bediako (278) + Cayra (279).
 * No cancel fee / no GC-fail fee (nothing collected on Autumn INV-Ps).
 *
 * - Void unpaid INV-P shares (main + hidden monthly instalment rows)
 * - Clear gocardless_failed soft holds
 * - Cancel pending GoCardless payments on mandate
 * - Mark re-enrolment weekly choices as withdraw
 * - MADRE + roster: Bediako / Cayra → NO PARTICIPANT
 *
 *   APPLY=1 node database/local-vault/office-romina-cancel-bediako-cayra.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";
const MADRE_ONLY = process.env.MADRE_ONLY === "1";
const CONTACTS = ["278", "279"];
const MAIN_INVOICES = ["INV-P-0042", "INV-P-0046"];
const MANDATE_ID = "MD003KPY2B9318";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const NOTE =
  "Office 2 Sep 2026 — Parent cancelled Autumn 2026/27 places (Bediako + Cayra). No cancel fee; Sep GC fail unpaid; no failure fee charged. Seats released.";

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

const sb = createClient(
  process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const gcToken = String(process.env.GOCARDLESS_ACCESS_TOKEN || "").trim();
const gcEnv = String(process.env.GOCARDLESS_ENVIRONMENT || "").trim().toLowerCase();
const gcBase =
  gcEnv === "live" || gcEnv === "production" || gcToken.startsWith("live_")
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTargetClient(name) {
  const n = norm(name).toLowerCase();
  return (
    n === "bediako" ||
    n.indexOf("bediako ") === 0 ||
    n === "cayra" ||
    n.indexOf("cayra ") === 0
  );
}

async function gcCancelPayment(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id || !gcToken) return { ok: false, error: "missing" };
  const res = await fetch(`${gcBase}/payments/${encodeURIComponent(id)}/actions/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gcToken}`,
      "GoCardless-Version": "2015-07-06",
      "Content-Type": "application/json",
      "Idempotency-Key": `cancel-${id}-romina-20260902`,
    },
    body: JSON.stringify({ data: {} }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const now = new Date().toISOString();

const { data: invs, error: invErr } = await sb
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, share_status, amount_gbp, amount_paid_gbp, notes, gocardless_payment_id, gocardless_mandate_id",
  )
  .in("contact_id", CONTACTS)
  .eq("gocardless_mandate_id", MANDATE_ID);
if (invErr) throw invErr;

const { data: holds, error: holdErr } = await sb
  .from("portal_family_payment_holds")
  .select("id, contact_id, status, reason, amount_gbp, grace_deadline_at")
  .in("contact_id", CONTACTS)
  .eq("reason", "gocardless_failed")
  .in("status", ["soft_hold", "session_held", "seat_blocked"]);
if (holdErr) throw holdErr;

const { data: subs, error: subErr } = await sb
  .from("portal_re_enrolment_submissions")
  .select("id, participant_name, participant_contact_id, payload, submitted_at")
  .in("participant_contact_id", CONTACTS)
  .eq("academic_year", "2026-27");
if (subErr) throw subErr;

console.log(APPLY ? (MADRE_ONLY ? "APPLY MADRE_ONLY" : "APPLY") : "DRY RUN");
console.log(
  "invoices",
  (invs || []).map((i) => ({
    n: i.invoice_number,
    contact: i.contact_id,
    pay: i.payment_status,
    share: i.share_status,
    paid: i.amount_paid_gbp,
    amt: i.amount_gbp,
  })),
);
console.log("holds", holds);
console.log(
  "subs",
  (subs || []).map((s) => ({
    id: s.id,
    name: s.participant_name,
    contact: s.participant_contact_id,
  })),
);

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to cancel.");
  process.exit(0);
}

if (!MADRE_ONLY) {
  for (const inv of invs || []) {
    const st = String(inv.payment_status || "").toLowerCase();
    if (st === "paid" || Number(inv.amount_paid_gbp || 0) > 0) {
      throw new Error(`Refusing paid invoice ${inv.invoice_number}`);
    }
    if (st === "void") {
      console.log("already void", inv.invoice_number);
      continue;
    }
    const { error } = await sb
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        share_status: "hidden",
        notes: `${String(inv.notes || "").trim()} · ${NOTE}`.trim().slice(0, 2000),
        updated_at: now,
      })
      .eq("id", inv.id);
    if (error) throw error;
    console.log("voided", inv.invoice_number, inv.contact_id);
  }

  for (const h of holds || []) {
    const { error } = await sb
      .from("portal_family_payment_holds")
      .update({
        status: "cleared",
        cleared_at: now,
        cleared_via: "office_cancel_booking",
        notes: NOTE,
        updated_at: now,
      })
      .eq("id", h.id);
    if (error) throw error;
    console.log("cleared hold", h.id, h.contact_id);
  }

  for (const s of subs || []) {
    const payload = structuredClone(s.payload || {});
    const weekly = payload?.choices?.weekly || payload?.services?.weekly;
    if (weekly && typeof weekly === "object") {
      for (const key of Object.keys(weekly)) {
        const row = weekly[key] || {};
        weekly[key] = { ...row, choice: "withdraw", alternative: null };
      }
    }
    if (payload.choices) payload.choices.weekly = weekly || payload.choices.weekly;
    payload.office_cancel = {
      at: now,
      note: NOTE,
      by: "office_romina_cancel_bediako_cayra",
    };
    const { error } = await sb
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", s.id);
    if (error) throw error;
    console.log("reenrol withdraw", s.participant_name, s.id);
  }

  const gcListRes = await fetch(
    `${gcBase}/payments?mandate=${encodeURIComponent(MANDATE_ID)}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${gcToken}`,
        "GoCardless-Version": "2015-07-06",
      },
    },
  );
  const gcList = await gcListRes.json();
  const pending = (gcList.payments || []).filter((p) =>
    /^(pending_submission|pending_customer_approval|customer_approval_granted|submitted)$/i.test(
      String(p.status || ""),
    ),
  );
  console.log(
    "GC pending to cancel",
    pending.map((p) => ({
      id: p.id,
      status: p.status,
      charge_date: p.charge_date,
      desc: p.description,
    })),
  );
  for (const p of pending) {
    const out = await gcCancelPayment(p.id);
    console.log(
      "GC cancel",
      p.id,
      out.ok ? "ok" : out.status,
      out.ok ? "" : JSON.stringify(out.body).slice(0, 200),
    );
  }
}

const madreRes = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/portal_madre_document?term_key=eq.summer-2026&select=term_key,revision,document,updated_at`,
  {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
);
const madreRows = await madreRes.json();
if (!Array.isArray(madreRows) || !madreRows[0]) throw new Error("madre missing");
const prevRev = Number(madreRows[0].revision) || 0;
const doc = structuredClone(madreRows[0].document);
const log = [];
for (const week of doc.weeks || []) {
  const list = Array.isArray(week.staff) ? week.staff : Object.values(week.staff || {});
  for (const st of list) {
    if (!st) continue;
    for (const day of st.days || []) {
      if (!day) continue;
      for (const slot of day.slots || []) {
        if (!slot || !isTargetClient(slot.client_name)) continue;
        const before = norm(slot.client_name);
        slot.client_name = "NO PARTICIPANT";
        slot.participant_info = "";
        log.push(
          `${norm(day.sessionDate).slice(0, 10) || "?"} ${day.weekday || "?"} ${st.staffKey || "?"} ${slot.time_slot} ${slot.service} @ ${slot.venue}: ${before} → NO PARTICIPANT`,
        );
      }
    }
  }
}
console.log("madre slots cleared", log.length);
if (log.length) {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Romina Banjo cancelled — Bediako + Cayra Acton Aquatic → NO PARTICIPANT (no fees; Sep GC fail unpaid)`,
  );
  doc.revisionNotes = Array.isArray(doc.revisionNotes) ? doc.revisionNotes : [];
  doc.revisionNotes.push(
    `rev ${prevRev + 1}: cancel Bediako/Cayra (Romina) — ${log.length} slots opened`,
  );
  const patchRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/portal_madre_document?term_key=eq.summer-2026&revision=eq.${prevRev}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        revision: prevRev + 1,
        document: doc,
        updated_at: now,
        updated_by: OFFICE_USER,
      }),
    },
  );
  if (!patchRes.ok) {
    console.error("madre patch failed", patchRes.status, await patchRes.text());
    throw new Error("madre patch failed");
  }
  console.log("madre rev", prevRev, "→", prevRev + 1);
  log.slice(0, 20).forEach((l) => console.log(" ", l));
  if (log.length > 20) console.log(" ...", log.length - 20, "more");
}

const { data: rosterRows } = await sb
  .from("portal_roster_rows")
  .select("id, client_name, day, time_slot, venue, session_date, instructors")
  .or("client_name.ilike.Bediako%,client_name.ilike.Cayra%");
for (const row of rosterRows || []) {
  if (!isTargetClient(row.client_name)) continue;
  const { error } = await sb
    .from("portal_roster_rows")
    .update({
      client_name: "NO PARTICIPANT",
      updated_at: now,
      updated_by: OFFICE_USER,
    })
    .eq("id", row.id);
  if (error) throw error;
  console.log("roster cleared", row.id, row.day, row.time_slot, row.client_name);
}

const { data: checkInv } = await sb
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, share_status, amount_paid_gbp")
  .in("contact_id", CONTACTS)
  .in("invoice_number", [...MAIN_INVOICES, "INV-P-0043", "INV-P-0044", "INV-P-0045", "INV-P-0047", "INV-P-0048", "INV-P-0049"]);
const { data: checkHolds } = await sb
  .from("portal_family_payment_holds")
  .select("id, contact_id, status, reason")
  .in("contact_id", CONTACTS)
  .eq("reason", "gocardless_failed");

console.log("invoice check", checkInv);
console.log("hold check", checkHolds);
console.log("DONE");
