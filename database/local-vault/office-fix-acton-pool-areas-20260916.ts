/**
 * Acton after-school pool areas (office 16 Sep 2026).
 * FIX / revisar→summer / NEW Abate TP / Ayman always DE / Kareena SE / Stephanie TP.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fix-acton-pool-areas-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const TERM = "summer-2026";
const STANDING = "2026-07-13";
const ACTOR = "d365ab5c-e190-461a-a390-31e54b0b066f";

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

type Job = {
  client_name: string;
  day: string;
  time_slot: string;
  instructors: string;
  area: string;
  venue?: string;
};

/** Explicit Acton AS targets (match by client + weekday; staff/time soft). */
const AREA_BY_CLIENT_DAY: Array<{
  client: RegExp;
  day: RegExp;
  area: string;
}> = [
  { client: /^christian\s+abate\b/i, day: /^tue/i, area: "Teaching Pool" },
  { client: /^emmanuel\s+abate\b/i, day: /^tue/i, area: "Teaching Pool" },
  { client: /^logan\b/i, day: /^tue/i, area: "Teaching Pool" },
  { client: /^rayan\s+ta\b/i, day: /^tue/i, area: "Teaching Pool" },
  { client: /^kareena\b/i, day: /^tue/i, area: "Lane (SE)" },
  { client: /^ayman\b/i, day: /./, area: "Lane (DE)" },
  { client: /^eddie\s+mc\b/i, day: /^mon/i, area: "Teaching Pool" },
  { client: /^adam\s+pi\b/i, day: /^fri/i, area: "Teaching Pool" },
  { client: /^stephanie\b/i, day: /^wed/i, area: "Teaching Pool" },
  { client: /^tom\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^elijah\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^yuri\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^khalid\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^joelle\b/i, day: /^thu/i, area: "Teaching Pool" },
  { client: /^mohamed\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^mohammed\b/i, day: /^thu/i, area: "Lane (SE)" },
  { client: /^maiyar\b/i, day: /^thu/i, area: "Teaching Pool" },
  { client: /^aqsa\b/i, day: /^thu/i, area: "Lane (DE)" },
];

function wantArea(client: string, day: string): string | null {
  const c = String(client || "").trim();
  const d = String(day || "").trim();
  for (const rule of AREA_BY_CLIENT_DAY) {
    if (rule.client.test(c) && rule.day.test(d)) return rule.area;
  }
  return null;
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

function isActonPool(service: string, venue: string) {
  const svc = String(service || "").toLowerCase();
  const ven = String(venue || "").toLowerCase();
  if (!/acton/.test(ven)) return false;
  if (/day centre|day center|bespoke/.test(svc)) return false;
  return /aquatic|multi|swim/.test(svc) || !svc;
}

const { data: actorRow } = await admin
  .from("portal_roster_rows")
  .select("created_by")
  .not("created_by", "is", null)
  .limit(1);
const actorId = String(actorRow?.[0]?.created_by || ACTOR);

const { data: rosterRows, error: rosterErr } = await admin
  .from("portal_roster_rows")
  .select("id, client_name, day, time_slot, instructors, area, venue, service, session_date, status")
  .eq("status", "active")
  .ilike("venue", "%Acton%");
if (rosterErr) throw new Error(rosterErr.message);

const rosterPlan: Array<{ id: string; client: string; day: string; time: string; from: string; to: string }> = [];
for (const r of rosterRows || []) {
  if (!isActonPool(String(r.service || ""), String(r.venue || ""))) continue;
  if (isSkipName(String(r.client_name || ""))) continue;
  const to = wantArea(String(r.client_name || ""), String(r.day || ""));
  if (!to) continue;
  const from = String(r.area || "").trim();
  if (from === to) continue;
  rosterPlan.push({
    id: String(r.id),
    client: String(r.client_name),
    day: String(r.day),
    time: String(r.time_slot),
    from: from || "(blank)",
    to,
  });
}

console.log("roster area updates", rosterPlan.length);
for (const p of rosterPlan.slice(0, 40)) {
  console.log(`  ${p.day} ${p.time} ${p.client}: ${p.from} → ${p.to}`);
}

const { data: madreRow, error: madreErr } = await admin
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", TERM)
  .maybeSingle();
if (madreErr || !madreRow) throw new Error(madreErr?.message || "MADRE missing");

const doc = structuredClone(madreRow.document) as {
  weeks?: Array<{ start?: string; staff?: Array<Record<string, unknown>> }>;
  meta?: Record<string, unknown>;
  revisionNotes?: string[];
};
const week = (doc.weeks || []).find((w) => w.start === STANDING);
if (!week) throw new Error("standing week missing");

const madrePlan: string[] = [];
let madreChanged = 0;
for (const col of Array.isArray(week.staff) ? week.staff : []) {
  if (!col || typeof col !== "object") continue;
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
      if (!isActonPool(service, venue)) continue;
      const to = wantArea(client, weekday);
      if (!to) continue;
      const prev = String(sl.area || sl.pool_note || "").trim();
      if (prev === to) continue;
      sl.area = to;
      sl.pool_note = to;
      madreChanged++;
      madrePlan.push(`${weekday} ${sl.time_slot} ${client}: ${prev || "(blank)"} → ${to}`);
    }
  }
}

console.log("madre area updates", madreChanged);
for (const line of madrePlan.slice(0, 40)) console.log(" ", line);

if (!APPLY) {
  console.log("Dry-run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

let updated = 0;
for (const p of rosterPlan) {
  const upd = await admin.from("portal_roster_rows").update({
    area: p.to,
    updated_by: actorId,
  }).eq("id", p.id);
  if (upd.error) console.warn("roster update", p.client, upd.error.message);
  else updated++;
}

const nextRev = Number(madreRow.revision) + 1;
doc.meta = doc.meta || {};
doc.meta.revision = nextRev;
doc.meta.lastLiveFoldNote =
  "office:acton pool areas FIX+summer+Abate TP+Ayman DE+Kareena SE+Stephanie TP 2026-09-16";
(doc.revisionNotes = doc.revisionNotes || []).push(
  `rev ${nextRev}: Acton AS pool areas — FIX SE/TP, Abate Teaching Pool, Ayman Lane (DE), Kareena Lane (SE), Stephanie Teaching Pool`,
);

const { error: upErr } = await admin
  .from("portal_madre_document")
  .update({
    revision: nextRev,
    document: doc,
    updated_by: actorId,
  })
  .eq("term_key", TERM);
if (upErr) throw new Error(upErr.message);

console.log(JSON.stringify({ rosterUpdated: updated, madreChanged, revision: nextRev }, null, 2));
