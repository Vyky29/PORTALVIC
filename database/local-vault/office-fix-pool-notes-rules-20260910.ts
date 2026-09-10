/**
 * Re-apply Autumn pool notes with office rules:
 * - Summer returners keep July note
 * - Joelle → Teaching Pool (explicit)
 * - Yunis → Lane (SE) (explicit)
 * - New Northolt → Teaching Pool
 * - Other new Acton keep snap autumn (or Teaching Pool if blank)
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fix-pool-notes-rules-20260910.ts
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
function isYunis(name: string) {
  return /^yunis\b/i.test(String(name || "").trim());
}
function isJoelle(name: string) {
  return /^joelle\b/i.test(String(name || "").trim());
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
  isNew?: boolean;
};

function resolveArea(s: SnapSlot): string {
  const july = String(s.july || "").trim();
  const autumn = String(s.autumn || "").trim();
  const venue = String(s.venue || "");
  const client = String(s.client || "");

  if (isYunis(client)) return "Lane (SE)";
  if (isJoelle(client)) return "Teaching Pool";

  /* Summer returners keep July note. */
  if (july) return july;

  /* New clients */
  if (/northolt/i.test(venue)) return "Teaching Pool";
  if (autumn) return autumn;
  if (/acton/i.test(venue) && /aquatic/i.test(String(s.service || ""))) return "Teaching Pool";
  return autumn || "Teaching Pool";
}

const snap = JSON.parse(readFileSync(SNAP, "utf8")) as {
  generatedAt?: string;
  areas?: string[];
  julySlots?: number;
  slots: SnapSlot[];
};

const jobs: Array<{
  client_name: string;
  day: string;
  time_slot: string;
  instructors: string;
  service: string;
  area: string;
  venue: string;
}> = [];
const seen = new Set<string>();

for (const s of snap.slots || []) {
  if (s.dated) continue;
  if (isSkipName(s.client)) continue;
  if (!isPoolish(s.service, s.venue)) continue;
  const area = resolveArea(s);
  if (!area) continue;
  s.autumn = area; /* keep snap consistent */
  const key = [
    s.day.toLowerCase(),
    s.client.toLowerCase(),
    s.time.toLowerCase(),
    s.staff.toLowerCase(),
    s.venue.toLowerCase(),
  ].join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  jobs.push({
    client_name: s.client,
    day: s.day,
    time_slot: s.time,
    instructors: s.staff,
    service: s.service,
    area,
    venue: s.venue,
  });
}

writeFileSync(SNAP, JSON.stringify(snap, null, 2));

const thuActon = jobs.filter((j) => /thu/i.test(j.day) && /acton/i.test(j.venue));
console.log("jobs", jobs.length);
console.log(
  "thu acton",
  thuActon.map((j) => `${j.time_slot} ${j.instructors} ${j.client_name} → ${j.area}`),
);

const noteByKey = new Map<string, string>();
for (const j of jobs) {
  const area = j.area;
  const keys = [
    [slug(j.day), slug(j.client_name), normTime(j.time_slot), slug(j.venue)].join("|"),
    [slug(j.day), firstTok(j.client_name), normTime(j.time_slot), slug(j.venue)].join("|"),
    [slug(j.day), slug(j.client_name), normTime(j.time_slot), slug(j.venue), slug(j.instructors)].join("|"),
    [slug(j.day), firstTok(j.client_name), normTime(j.time_slot), slug(j.venue), slug(j.instructors)].join("|"),
  ];
  for (const k of keys) noteByKey.set(k, area);
}

if (!APPLY) {
  console.log("Dry-run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const { data: actorRow } = await admin
  .from("portal_roster_rows")
  .select("created_by")
  .not("created_by", "is", null)
  .limit(1);
const actorId = String(actorRow?.[0]?.created_by || "");
if (!actorId) throw new Error("no actor id");

let updated = 0;
let inserted = 0;
let skippedSame = 0;
for (const row of jobs) {
  let found = await admin
    .from("portal_roster_rows")
    .select("id, area, instructors")
    .eq("status", "active")
    .eq("client_name", row.client_name)
    .eq("time_slot", row.time_slot)
    .eq("day", row.day)
    .eq("instructors", row.instructors)
    .eq("venue", row.venue)
    .is("session_date", null)
    .maybeSingle();
  if (found.error && found.error.code !== "PGRST116") {
    console.warn("lookup", row.client_name, found.error.message);
    continue;
  }
  if (!found.data?.id) {
    const loose = await admin
      .from("portal_roster_rows")
      .select("id, area, instructors")
      .eq("status", "active")
      .eq("client_name", row.client_name)
      .eq("time_slot", row.time_slot)
      .eq("day", row.day)
      .eq("venue", row.venue)
      .is("session_date", null)
      .limit(8);
    const hit = (loose.data || []).find((r) =>
      String(r.instructors || "").trim().toLowerCase() ===
        String(row.instructors || "").trim().toLowerCase()
    );
    if (hit) found = { data: hit, error: null };
  }
  if (found.data?.id) {
    if (String(found.data.area || "") === row.area) {
      skippedSame++;
      continue;
    }
    const upd = await admin.from("portal_roster_rows").update({
      area: row.area,
      service: row.service,
      instructors: row.instructors,
      updated_by: actorId,
    }).eq("id", found.data.id);
    if (upd.error) console.warn("update", row.client_name, upd.error.message);
    else updated++;
  } else {
    const ins = await admin.from("portal_roster_rows").insert({
      ...row,
      session_date: null,
      status: "active",
      created_by: actorId,
      updated_by: actorId,
    });
    if (ins.error) console.warn("insert", row.client_name, ins.error.message);
    else inserted++;
  }
}
console.log(JSON.stringify({ roster: { updated, inserted, skippedSame } }, null, 2));

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
for (const col of Array.isArray(week.staff) ? week.staff : []) {
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
      const want = noteByKey.get([slug(weekday), slug(client), normTime(time), slug(venue), slug(staffKey)].join("|")) ||
        noteByKey.get([slug(weekday), firstTok(client), normTime(time), slug(venue), slug(staffKey)].join("|")) ||
        noteByKey.get([slug(weekday), slug(client), normTime(time), slug(venue)].join("|")) ||
        noteByKey.get([slug(weekday), firstTok(client), normTime(time), slug(venue)].join("|"));
      if (!want) continue;
      const prev = String(sl.area || sl.pool_note || "").trim();
      if (prev === want) continue;
      sl.area = want;
      sl.pool_note = want;
      changed++;
      if (sample.length < 25) sample.push(`${weekday} ${time} ${staffKey} ${client}: ${prev || "(blank)"} → ${want}`);
    }
  }
}

const nextRev = Number(data.revision) + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.lastLiveFoldNote = "office:pool notes rules summer-keep + Yunis SE + Joelle TP 2026-09-10";
(doc.revisionNotes = doc.revisionNotes || []).push(
  `rev ${nextRev}: pool notes — summer returners keep July; Yunis Lane (SE); Joelle Teaching Pool; Northolt new Teaching Pool`,
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

writeFileSync(path.join(ROOT, "working_ui/portal/roster_term_master.json"), JSON.stringify(doc, null, 2));
console.log("madre patches", changed);
console.log(sample.join("\n"));
console.log("MADRE written revision", up.revision);
