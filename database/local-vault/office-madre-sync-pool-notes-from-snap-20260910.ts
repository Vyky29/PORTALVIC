/**
 * Push Autumn pool/area notes from pool-notes-july-autumn.json onto MADRE
 * standing week 2026-07-13 (area + pool_note), then mirror roster_term_master.json.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-madre-sync-pool-notes-from-snap-20260910.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ROOT = Deno.cwd();
const SNAP = path.join(ROOT, "database/local-vault/tmp/pool-notes-july-autumn.json");
const TERM = "summer-2026";
const STANDING = "2026-07-13";

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
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function slug(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\(trial\)/gi, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstTok(raw: string) {
  return slug(raw).split("_").filter(Boolean)[0] || "";
}

function normTime(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " to ")
    .replace(/(\d)\.(\d)/g, "$1:$2")
    .trim();
}

function isSkipName(name: string) {
  const n = String(name || "").trim().toLowerCase();
  return !n ||
    n === "no participant" ||
    n === "no client" ||
    n === "noclient" ||
    n === "closed" ||
    n === "available" ||
    n === "manager" ||
    n === "home" ||
    n === "casa" ||
    n === "office";
}

function isPoolish(service: string, venue: string) {
  const svc = String(service || "").toLowerCase();
  const ven = String(venue || "").toLowerCase();
  if (/day centre|day center/.test(svc)) return false;
  if (/bespoke/.test(svc)) return false;
  if (/aquatic|multi|climb|physical|fitness/.test(svc)) return true;
  return /acton|northolt|swimfarm|westway/.test(ven);
}

type SnapSlot = {
  day: string;
  venue: string;
  time: string;
  staff: string;
  client: string;
  service: string;
  july: string;
  autumn: string;
  dated: string;
};

const snap = JSON.parse(readFileSync(SNAP, "utf8")) as { slots: SnapSlot[] };

/** Prefer autumn note; fall back to july only when autumn blank. */
const noteByKey = new Map<string, string>();
for (const s of snap.slots || []) {
  if (s.dated) continue;
  if (isSkipName(s.client)) continue;
  if (!isPoolish(s.service, s.venue)) continue;
  const area = String(s.autumn || s.july || "").trim();
  if (!area) continue;
  const keys = [
    [slug(s.day), slug(s.client), normTime(s.time), slug(s.venue)].join("|"),
    [slug(s.day), firstTok(s.client), normTime(s.time), slug(s.venue)].join("|"),
    [slug(s.day), slug(s.client), normTime(s.time), slug(s.venue), slug(s.staff)].join("|"),
    [slug(s.day), firstTok(s.client), normTime(s.time), slug(s.venue), slug(s.staff)].join("|"),
  ];
  for (const k of keys) {
    if (!noteByKey.has(k) || String(s.autumn || "").trim()) noteByKey.set(k, area);
  }
}

const { data, error } = await admin
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", TERM)
  .maybeSingle();
if (error || !data) throw new Error(error?.message || "MADRE missing");

const doc = structuredClone(data.document) as {
  weeks?: Array<{ start?: string; staff?: Array<Record<string, unknown>> }>;
  meta?: Record<string, unknown>;
  revisionNotes?: string[];
};
const week = (doc.weeks || []).find((w) => w.start === STANDING);
if (!week) throw new Error("standing week missing");

let changed = 0;
const sample: string[] = [];
const staffList = Array.isArray(week.staff) ? week.staff : [];
for (const col of staffList) {
  if (!col || typeof col !== "object") continue;
  const staffKey = String(col.staffKey || col.staffName || "");
  const days = Array.isArray(col.days) ? col.days as Array<Record<string, unknown>> : [];
  for (const d of days) {
    if (!d || typeof d !== "object") continue;
    const weekday = String(d.weekday || "");
    const slots = Array.isArray(d.slots) ? d.slots as Array<Record<string, unknown>> : [];
    for (const sl of slots) {
      if (!sl || typeof sl !== "object") continue;
      const client = String(sl.client_name || "");
      if (isSkipName(client)) continue;
      const venue = String(sl.venue || "");
      const service = String(sl.service || "");
      if (!isPoolish(service, venue)) continue;
      const time = String(sl.time_slot || "");
      const kStaff = [slug(weekday), slug(client), normTime(time), slug(venue), slug(staffKey)].join("|");
      const kStaffFirst = [slug(weekday), firstTok(client), normTime(time), slug(venue), slug(staffKey)].join("|");
      const kLoose = [slug(weekday), slug(client), normTime(time), slug(venue)].join("|");
      const kLooseFirst = [slug(weekday), firstTok(client), normTime(time), slug(venue)].join("|");
      const want = noteByKey.get(kStaff) || noteByKey.get(kStaffFirst) || noteByKey.get(kLoose) ||
        noteByKey.get(kLooseFirst);
      if (!want) continue;
      const prevArea = String(sl.area || "").trim();
      const prevNote = String(sl.pool_note || "").trim();
      if (prevArea === want && prevNote === want) continue;
      sl.area = want;
      sl.pool_note = want;
      changed++;
      if (sample.length < 20) {
        sample.push(`${weekday} ${time} ${staffKey} ${client}: ${prevArea || prevNote || "(blank)"} → ${want}`);
      }
    }
  }
}

console.log("note keys", noteByKey.size, "madre slot patches", changed);
console.log(sample.join("\n"));
console.log("prev rev", data.revision, APPLY ? "APPLY" : "dry-run");

if (!APPLY) {
  console.log("Re-run with APPLY=1 to write MADRE.");
  Deno.exit(0);
}

const nextRev = Number(data.revision) + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.lastLiveFoldNote = "office:autumn pool notes from july-vs-autumn snap 2026-09-10";
(doc.revisionNotes = doc.revisionNotes || []).push(
  `rev ${nextRev}: Autumn pool/area notes sync from office HTML corrections (standing week)`,
);

const { data: up, error: upErr } = await admin
  .from("portal_madre_document")
  .update({
    revision: nextRev,
    document: doc,
    updated_at: new Date().toISOString(),
  })
  .eq("term_key", TERM)
  .eq("revision", data.revision)
  .select("revision")
  .maybeSingle();
if (upErr) throw new Error(upErr.message);
if (!up) throw new Error("revision conflict — re-run");
console.log("MADRE written revision", up.revision);

const localPath = path.join(ROOT, "working_ui/portal/roster_term_master.json");
writeFileSync(localPath, JSON.stringify(doc, null, 2));
console.log("mirrored", localPath);
