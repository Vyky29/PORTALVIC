/**
 * Belhadj Eiji + Hazem: drop Multi-Activity from portal_participant_service_lines.
 * Invoice already bills Climb + MA first half only (INV-P-0079 / INV-P-0083).
 * Standing roster opens Multi seats from 2026-10-19; Climbing stays.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-belhadj-drop-multi-service-lines-20261017.ts
 * Apply: npx -y deno run -A database/local-vault/office-belhadj-drop-multi-service-lines-20261017.ts --apply
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const APPLY = Deno.args.includes("--apply");
const KEYS = ["kacem_eiji_belhadj", "eiji", "hazem_kei_belhadj", "hazem"];

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function isMulti(session: Record<string, unknown>): boolean {
  const svc = String(session.service || session.label || session.programme || "");
  return /multi[\s-]*activity/i.test(svc);
}

const { data: rows, error } = await admin
  .from("portal_participant_service_lines")
  .select("id, client_key, client_name, sessions, services_count, source, term_label")
  .or(KEYS.map((k) => `client_key.eq.${k}`).join(","));

if (error) throw new Error(error.message);

const matched = (rows || []).filter((r) => {
  const key = String(r.client_key || "").toLowerCase();
  const name = String(r.client_name || "").toLowerCase();
  return (
    KEYS.some((k) => key === k || key.includes(k)) ||
    /\beiji\b/.test(name) ||
    /\bhazem\b/.test(name)
  );
});

if (!matched.length) {
  /* broader name search */
  const { data: byName, error: nameErr } = await admin
    .from("portal_participant_service_lines")
    .select("id, client_key, client_name, sessions, services_count, source, term_label")
    .or("client_name.ilike.%eiji%,client_name.ilike.%hazem%,client_name.ilike.%belhadj%");
  if (nameErr) throw new Error(nameErr.message);
  matched.push(...(byName || []));
}

const seen = new Set<string>();
for (const row of matched) {
  if (!row?.id || seen.has(row.id)) continue;
  seen.add(row.id);
  const sessions = Array.isArray(row.sessions) ? row.sessions : [];
  const next = sessions.filter((s) => !isMulti((s || {}) as Record<string, unknown>));
  const dropped = sessions.length - next.length;
  console.log({
    id: row.id,
    client_key: row.client_key,
    client_name: row.client_name,
    term_label: row.term_label,
    before: sessions.length,
    after: next.length,
    dropped,
    kept: next.map((s) => ({
      service: (s as { service?: string }).service,
      day: (s as { day?: string }).day,
      time: (s as { timeSlot?: string }).timeSlot,
    })),
  });
  if (!dropped) continue;
  if (!APPLY) continue;
  const { error: up } = await admin
    .from("portal_participant_service_lines")
    .update({
      sessions: next,
      services_count: next.length,
      updated_at: new Date().toISOString(),
      source: "office_belhadj_drop_multi_20261017",
    })
    .eq("id", row.id);
  if (up) throw new Error(up.message);
  console.log("updated", row.id);
}

console.log(APPLY ? "APPLY done" : "Dry-run. Pass --apply to write.");
