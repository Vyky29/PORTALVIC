/**
 * Restore summer MADRE client names wiped to NO PARTICIPANT by reenrol release.
 * Matches dated slots against staff_dashboard_spreadsheet_bundle.js rows.
 * Does not touch CLOSED office-hold lines or sessions on/after 2026-09-01.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/restore-madre-pre-sept-from-bundle.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/restore-madre-pre-sept-from-bundle.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { MADRE_TERM_KEY } from "../../supabase/functions/_shared/portal_reenrol_release_madre.ts";
import type { MadreDoc } from "../../supabase/functions/_shared/portal_madre_fold_logic.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CUTOFF = "2026-09-01";
const BUNDLE_PATH = "working_ui/portal/staff_dashboard_spreadsheet_bundle.js";

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

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function normTime(v: unknown): string {
  return norm(v)
    .toLowerCase()
    .replace(/(\d)\.00\b/g, "$1")
    .replace(/\s+/g, " ");
}

function staffKeyFromInstructors(raw: unknown): string {
  const first = norm(raw).split(",")[0] || "";
  return first.toLowerCase().replace(/[^a-z]/g, "");
}

type BundleRow = {
  client_name?: string;
  day?: string;
  instructors?: string;
  service?: string;
  area?: string;
  time_slot?: string;
  venue?: string;
  session_date?: string;
};

function loadBundleRows(): BundleRow[] {
  const src = Deno.readTextFileSync(BUNDLE_PATH);
  const m = src.match(/"rows"\s*:\s*(\[[\s\S]*?\n  \])/);
  if (!m) throw new Error("Could not parse STAFF_DASHBOARD_SOURCE.rows");
  return JSON.parse(m[1]) as BundleRow[];
}

function bundleLookupKey(
  sessionDate: string,
  staff: string,
  time: string,
  venue: string,
): string {
  return [
    sessionDate.slice(0, 10),
    staff.toLowerCase(),
    normTime(time),
    norm(venue).toLowerCase(),
  ].join("|");
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const bundleRows = loadBundleRows();
const byKey = new Map<string, BundleRow>();
for (const r of bundleRows) {
  const iso = norm(r.session_date).slice(0, 10);
  const client = norm(r.client_name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
  if (!client || /^no participant$/i.test(client) || /^closed$/i.test(client)) {
    continue;
  }
  const staff = staffKeyFromInstructors(r.instructors);
  if (!staff) continue;
  const key = bundleLookupKey(iso, staff, r.time_slot || "", r.venue || "");
  // Prefer first named row for that slot.
  if (!byKey.has(key)) byKey.set(key, r);
}
console.log("bundle named keys", byKey.size);

const { data: row, error } = await admin
  .from("portal_madre_document")
  .select("revision, document, updated_at")
  .eq("term_key", MADRE_TERM_KEY)
  .maybeSingle();
if (error || !row?.document) throw new Error(error?.message || "madre_missing");

const doc = structuredClone(row.document) as MadreDoc;
const notes: string[] = [];
let changed = 0;

for (const week of doc.weeks ?? []) {
  for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown>>) {
    const staff = norm(st.staffKey || st.name).toLowerCase().replace(/[^a-z]/g, "");
    const days = (st.days as Array<Record<string, unknown>>) || [];
    for (const day of days) {
      const iso = norm(day.sessionDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso >= CUTOFF) continue;
      const slots = (day.slots as Array<Record<string, unknown>>) || [];
      for (const slot of slots) {
        const client = norm(slot.client_name);
        if (!/^no participant$/i.test(client)) continue;
        const key = bundleLookupKey(
          iso,
          staff,
          String(slot.time_slot || ""),
          String(slot.venue || ""),
        );
        const match = byKey.get(key);
        if (!match) continue;
        const restoreName = norm(match.client_name);
        slot.client_name = restoreName;
        if (match.service) slot.service = match.service;
        if (match.area) slot.area = match.area;
        if ("participant_info" in slot) slot.participant_info = "";
        changed += 1;
        notes.push(
          `${iso} ${staff} ${norm(slot.time_slot)} ${norm(slot.venue)} → ${restoreName}`,
        );
      }
    }
  }
}

console.log("revision", row.revision, row.updated_at);
console.log("would_restore", changed);
console.log("sample", notes.slice(0, 40));
const ayden = notes.filter((n) => /ayden/i.test(n));
const scott = notes.filter((n) => /scott/i.test(n));
console.log("ayden restores", ayden.length, ayden);
console.log("scott restores", scott.length, scott);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to write MADRE.");
  Deno.exit(0);
}

if (changed <= 0) {
  console.log("Nothing to restore.");
  Deno.exit(0);
}

const meta = (doc.meta || {}) as Record<string, unknown>;
doc.meta = {
  ...meta,
  madre_pre_sept_restore_at: new Date().toISOString(),
  madre_pre_sept_restore_changed: changed,
  madre_pre_sept_restore_note:
    "Restored NO PARTICIPANT → bundle names for sessionDate < 2026-09-01 after reenrol release wiped summer history.",
};

const nextRev = (Number(row.revision) || 0) + 1;
const { error: upErr } = await admin
  .from("portal_madre_document")
  .update({
    document: doc,
    revision: nextRev,
    updated_at: new Date().toISOString(),
  })
  .eq("term_key", MADRE_TERM_KEY)
  .eq("revision", row.revision);
if (upErr) {
  console.error(upErr.message);
  Deno.exit(1);
}
console.log("OK restored", changed, "revision", nextRev);
