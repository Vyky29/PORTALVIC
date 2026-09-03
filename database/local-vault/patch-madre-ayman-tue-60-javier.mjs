/**
 * Ayman Tue Acton: invoices are Aquatic 60' 4–5 (INV-P-0139 etc).
 * Consolidate MADRE Javier Tue split 4–4.30 + 4.30–5 → single 4–5.
 *
 *   node database/local-vault/patch-madre-ayman-tue-60-javier.mjs
 *   APPLY=1 node database/local-vault/patch-madre-ayman-tue-60-javier.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";

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

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function norm(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/:/g, ".");
}

function isAyman(name) {
  return /^ayman\b/i.test(String(name || "").trim());
}

function isOpen(name) {
  const u = String(name || "").trim().toUpperCase();
  return !u || u === "NO PARTICIPANT" || u === "NO CLIENT";
}

const { data: row, error } = await sb
  .from("portal_madre_document")
  .select("term_key, revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (error || !row) {
  console.error(error || "missing doc");
  process.exit(1);
}

const doc = structuredClone(row.document);
const log = [];

for (const week of doc.weeks || []) {
  for (const s of Object.values(week.staff || {})) {
    if (!s || String(s.staffKey || "").toLowerCase() !== "javier") continue;
    for (const day of s.days || []) {
      if (!day || day.weekday !== "Tuesday") continue;
      const slots = day.slots || [];
      const aymanSlots = slots.filter((sl) => isAyman(sl.client_name));
      if (!aymanSlots.length) continue;

      const has430 = aymanSlots.some((sl) => /4\.?30\s*to\s*5\b/i.test(norm(sl.time_slot)));
      const has4 = aymanSlots.some((sl) => /^4\s*to\s*4\.?30\b/i.test(norm(sl.time_slot)));
      const has1h = aymanSlots.some((sl) => /^4\s*to\s*5\b/i.test(norm(sl.time_slot)));

      if (has1h && aymanSlots.length === 1) {
        log.push(`${week.start}: already 4–5`);
        continue;
      }

      const template = aymanSlots[0];
      const keep = slots.filter((sl) => {
        const t = norm(sl.time_slot);
        if (isAyman(sl.client_name) && (/^4\s*to\s*4\.?30\b/.test(t) || /4\.?30\s*to\s*5\b/.test(t) || /^4\s*to\s*5\b/.test(t))) {
          return false;
        }
        // drop open 4.30-5 if we are placing Ayman 4-5
        if (isOpen(sl.client_name) && /4\.?30\s*to\s*5\b/.test(t)) return false;
        if (isOpen(sl.client_name) && /^4\s*to\s*4\.?30\b/.test(t)) return false;
        return true;
      });

      keep.push({
        ...template,
        time_slot: "4 to 5",
        client_name: "Ayman",
        instructors: "JAVIER",
        venue: "Acton",
        service: "Aquatic Activity",
        area: template.area || "Lane (DE)",
        pool_note: template.pool_note || template.area || "Lane (DE)",
      });

      keep.sort((a, b) => {
        const am = norm(a.time_slot).match(/(\d{1,2})(?:\.(\d{2}))?/);
        const bm = norm(b.time_slot).match(/(\d{1,2})(?:\.(\d{2}))?/);
        const av = am ? (+am[1] * 60 + +(am[2] || 0)) : 0;
        const bv = bm ? (+bm[1] * 60 + +(bm[2] || 0)) : 0;
        return av - bv;
      });

      day.slots = keep;
      log.push(
        `${week.start}: merge Tue Ayman → Javier 4–5 (was ${aymanSlots.map((x) => x.time_slot).join(" + ")}; has4=${has4} has430=${has430})`,
      );
    }
  }
}

console.log("Mode:", APPLY ? "APPLY" : "DRY-RUN");
console.log("rev", row.revision, "→", row.revision + (APPLY ? 1 : 0));
for (const line of log) console.log(" ", line);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with APPLY=1 to write.");
  process.exit(0);
}

doc.revisionNotes = Array.isArray(doc.revisionNotes) ? doc.revisionNotes : [];
doc.revisionNotes.push({
  at: new Date().toISOString(),
  note: "Ayman Tue Acton Aquatic → Javier 4–5 (60' per INV-P-0139; was split 30'+30')",
});

const nextRev = Number(row.revision) + 1;
const { data: upd, error: upErr } = await sb
  .from("portal_madre_document")
  .update({ document: doc, revision: nextRev })
  .eq("term_key", "summer-2026")
  .eq("revision", row.revision)
  .select("revision")
  .maybeSingle();

if (upErr || !upd) {
  console.error("UPDATE FAIL", upErr || "revision conflict");
  process.exit(1);
}
console.log("UPDATED revision", upd.revision);
