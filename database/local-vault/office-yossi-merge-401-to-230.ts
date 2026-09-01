/**
 * Yossi Sium: finish-booking created duplicate contact 401 ("Yosiyas") instead of
 * reusing existing 230 ("Yossi"). Merge booking artefacts onto 230, confirm seat,
 * place MADRE Roberto Thu 5–5.30 Acton, soft-retire 401.
 *
 * Dry:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-yossi-merge-401-to-230.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-yossi-merge-401-to-230.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const KEEP = "230";
const DUP = "401";
const KEEP_PARENT = "6124794";
const DUP_PARENT = "portal-401-parent";
const INV_ID = "716ac0de-6bb1-4db5-b9f3-66fadbc1c632";
const TOKEN_ID = "6e8b4856-73a0-4744-813a-f10f6982d8f2";
const RES_ID = "897e5812-5d77-4e58-91a9-a5fd98ac698b";
const DOC_INV = "713d9393-f5ba-4ed6-8fc4-18791e155cef";
const NOTE =
  "Office 20 Aug 2026: merged Yosiyas/401 finish-booking into Yossi/230 (same family).";

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

function norm(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function timeKey(t: unknown) {
  return norm(t).toLowerCase().replace(/:/g, ".");
}
function findStaff(week: Record<string, unknown>, key: string) {
  const want = key.toLowerCase();
  const staff = (week.staff || {}) as Record<string, Record<string, unknown>>;
  return Object.entries(staff).find(([k, s]) => {
    if (!s) return false;
    return String(s.staffKey || k || "").toLowerCase() === want;
  })?.[1];
}

const now = new Date().toISOString();
const log: string[] = [];

const { data: c230 } = await admin
  .from("portal_parent_contacts")
  .select("*")
  .eq("contact_id", KEEP)
  .maybeSingle();
const { data: c401 } = await admin
  .from("portal_parent_contacts")
  .select("*")
  .eq("contact_id", DUP)
  .maybeSingle();
if (!c230 || !c401) throw new Error("missing contacts 230/401");

log.push(`keep ${KEEP} ${c230.child_display} / dup ${DUP} ${c401.child_display}`);

// --- invoice → 230 ---
{
  const { data: inv } = await admin
    .from("portal_parent_invoice_share")
    .select("notes")
    .eq("id", INV_ID)
    .maybeSingle();
  const notes = [norm(inv?.notes), NOTE].filter(Boolean).join(" · ").slice(0, 2000);
  log.push(`invoice INV-P-0369 contact ${DUP} → ${KEEP}`);
  if (APPLY) {
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update({ contact_id: KEEP, notes, updated_at: now })
      .eq("id", INV_ID);
    if (error) throw new Error(`invoice: ${error.message}`);
  }
}

// --- document title ---
{
  log.push(`documents ${DOC_INV} related_client → Yossi Sium`);
  if (APPLY) {
    const { error } = await admin
      .from("documents")
      .update({
        title: "INV-P-0369 — Yossi Sium",
        related_client: "Yossi Sium",
      })
      .eq("id", DOC_INV);
    if (error) console.warn("documents update", error.message);
  }
}

// --- completion token ---
{
  log.push(`token ${TOKEN_ID} contact/parent → ${KEEP}/${KEEP_PARENT}`);
  if (APPLY) {
    const { error } = await admin
      .from("portal_booking_completion_tokens")
      .update({
        contact_id: KEEP,
        parent_person_id: KEEP_PARENT,
        updated_at: now,
      })
      .eq("id", TOKEN_ID);
    if (error) throw new Error(`token: ${error.message}`);
  }
}

// --- reservation: paid seat stays validated (confirmed not in check constraint) ---
{
  // hold_expires_at is NOT NULL — park far future so expire-unpaid job skips it.
  const holdPark = "2099-01-01T00:00:00.000Z";
  log.push(`reservation ${RES_ID} awaiting_payment → validated (paid), name Yossi Sium`);
  if (APPLY) {
    const { error } = await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "validated",
        participant_name: "Yossi Sium",
        parent_name: "Tirhas Sium",
        parent_email: "tirhassium39@gmail.com",
        hold_expires_at: holdPark,
        released_at: null,
        notes: "accepted_by_admin|paid_finish_booking|merged_to_contact_230",
        updated_at: now,
      })
      .eq("id", RES_ID);
    if (error) throw new Error(`reservation: ${error.message}`);
  }
}

// --- contact 230 refresh from booking ---
{
  log.push(`contact ${KEEP}: funding/payment/reg + xero from 401; keep name Yossi`);
  if (APPLY) {
    const { error } = await admin
      .from("portal_parent_contacts")
      .update({
        funding_label: c401.funding_label || c230.funding_label,
        payment_method_label: c401.payment_method_label || c230.payment_method_label,
        registration_date: c401.registration_date || c230.registration_date,
        xero_contact_id: c401.xero_contact_id || c230.xero_contact_id,
        address_line1: c230.address_line1 || c401.address_line1,
        postcode: c230.postcode || c401.postcode,
        in_class: true,
        updated_at: now,
      })
      .eq("contact_id", KEEP);
    if (error) throw new Error(`contact230: ${error.message}`);
  }
}

// --- soft-retire 401 (avoid double-match on email/phone) ---
{
  log.push(`soft-retire contact ${DUP} + participant + dup PIN`);
  if (APPLY) {
    // email_norm / phone_lookup are generated columns — only patch source fields.
    const { error: e1 } = await admin
      .from("portal_parent_contacts")
      .update({
        child_display: "Yosiyas Sium (merged→230)",
        child_first_name: "Yosiyas",
        email: `merged-401-into-230+${DUP}@invalid.local`,
        mobile: `0000000401`,
        in_class: false,
        on_waiting_list: false,
        updated_at: now,
      })
      .eq("contact_id", DUP);
    if (e1) throw new Error(`retire401: ${e1.message}`);

    await admin
      .from("portal_participants")
      .update({
        display_name: "Yosiyas Sium (merged→230)",
        in_class: false,
        updated_at: now,
      })
      .eq("contact_id", DUP);

    // Keep Tirhas PIN on 6124794; remove the finish-booking PIN on portal-401-parent
    await admin.from("portal_parent_portal_credentials").delete().eq("parent_person_id", DUP_PARENT);
  }
}

// --- MADRE: Roberto Thu 5–5.30 Acton open seats → Yossi ---
// summer-2026 doc currently only has Jun–Jul weeks; still stamp NO PARTICIPANT /
// Yosiyas cells so the standing band is occupied for the live offer.
{
  const { data: rows, error } = await admin
    .from("portal_madre_document")
    .select("term_key,revision,document")
    .eq("term_key", "summer-2026")
    .single();
  if (error || !rows) throw new Error(`madre: ${error?.message || "missing"}`);
  const prevRev = Number(rows.revision) || 0;
  const doc = structuredClone(rows.document) as {
    weeks?: Array<Record<string, unknown>>;
    meta?: { notes?: string[] };
  };
  const madreLog: string[] = [];
  for (const week of doc.weeks || []) {
    const roberto = findStaff(week, "roberto");
    if (!roberto) continue;
    for (const day of (roberto.days as Array<Record<string, unknown>>) || []) {
      if (!/thu/i.test(norm(day.weekday))) continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
        if (!/acton/i.test(norm(s.venue))) continue;
        const svc = norm(s.service);
        if (svc && !/aquatic|swim/i.test(svc)) continue;
        const t = timeKey(s.time_slot);
        if (!/^(5(\.00)?\s*to\s*5\.30|17(\.00)?\s*to\s*17\.30)$/.test(t)) continue;
        const before = norm(s.client_name) || "(empty)";
        const up = before.toUpperCase();
        if (up === "YOSSI" || /^yossi\b/i.test(before)) {
          madreLog.push(`${iso} already Yossi`);
          continue;
        }
        // Only reclaim open / misnamed duplicate — never CLOSED or other clients.
        if (up !== "NO PARTICIPANT" && !/yosiyas/i.test(before)) {
          madreLog.push(`${iso} skip ${before}`);
          continue;
        }
        s.client_name = "Yossi";
        s.service = "Aquatic Activity";
        s.venue = "Acton";
        s.time_slot = "5 to 5.30";
        s.instructors = "ROBERTO";
        madreLog.push(`${iso} ${before} → Yossi`);
      }
    }
  }
  log.push(`MADRE patches: ${madreLog.filter((l) => l.includes("→")).length}`);
  for (const l of madreLog.slice(0, 12)) log.push(`  madre: ${l}`);
  if (madreLog.some((l) => l.includes("→")) && APPLY) {
    doc.meta = doc.meta || {};
    doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
    doc.meta.notes.push(NOTE);
    const { error: upErr } = await admin
      .from("portal_madre_document")
      .update({ document: doc, revision: prevRev + 1, updated_at: now })
      .eq("term_key", "summer-2026")
      .eq("revision", prevRev);
    if (upErr) throw new Error(`madre save: ${upErr.message}`);
    log.push(`MADRE revision ${prevRev} → ${prevRev + 1}`);
  }
}

console.log(APPLY ? "APPLY" : "DRY RUN");
for (const line of log) console.log("-", line);
if (!APPLY) console.log("\nRe-run with APPLY=1 to write.");
