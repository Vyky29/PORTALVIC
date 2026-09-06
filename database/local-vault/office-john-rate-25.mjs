#!/usr/bin/env node
/**
 * Apply John £25/h Support Worker rates on Portal (staff_role_rates + staff_pay_rates).
 *
 *   node database/local-vault/office-john-rate-25.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const JOHN_ID = "fec4f699-739e-48ee-ba0c-604f9887e874";

function readEnv(key) {
  for (const rel of [
    "local-secrets/secrets.env",
    "database/local-vault/private/parent-portal-secrets.env",
  ]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    const m = txt.match(new RegExp("^\\s*" + key + "\\s*=\\s*(.+?)\\s*$", "m"));
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  return process.env[key] || "";
}

async function main() {
  const url = readEnv("SUPABASE_URL") || readEnv("PORTAL_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("PORTAL_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: profiles, error: pErr } = await sb
    .from("staff_profiles")
    .select("id, username, full_name")
    .or(
      `id.eq.${JOHN_ID},username.ilike.john,username.ilike.johnny,full_name.ilike.John%`
    );
  if (pErr) throw pErr;
  const ids = [...new Set((profiles || []).map((p) => p.id).filter(Boolean))];
  if (!ids.length) throw new Error("John staff_profiles row not found");
  console.log(
    "John profiles:",
    (profiles || []).map((p) => `${p.username || ""} / ${p.full_name || ""} (${p.id})`).join("; ")
  );

  for (const uid of ids) {
    const { error: clearErr } = await sb
      .from("staff_role_rates")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("user_id", uid);
    if (clearErr) throw clearErr;

    const { error: upRoleErr } = await sb.from("staff_role_rates").upsert(
      {
        user_id: uid,
        role: "Support Worker",
        scale: "Scale 2",
        hourly_rate: 25,
        is_primary: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role" }
    );
    if (upRoleErr) throw upRoleErr;

    const { data: leads } = await sb
      .from("staff_role_rates")
      .select("id, role")
      .eq("user_id", uid);
    for (const row of leads || []) {
      const r = String(row.role || "").toLowerCase();
      if (r === "service lead" || r === "lead" || r.includes("session lead")) {
        await sb
          .from("staff_role_rates")
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }

    const { data: existingPay } = await sb
      .from("staff_pay_rates")
      .select("user_id")
      .eq("user_id", uid)
      .maybeSingle();
    if (existingPay) {
      const { error: payErr } = await sb
        .from("staff_pay_rates")
        .update({
          hourly_rate: 25,
          role_label: "Support Worker 2",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", uid);
      if (payErr) throw payErr;
    } else {
      const { error: payIns } = await sb.from("staff_pay_rates").insert({
        user_id: uid,
        hourly_rate: 25,
        role_label: "Support Worker 2",
      });
      if (payIns) throw payIns;
    }
  }

  const { data: check } = await sb
    .from("staff_role_rates")
    .select("role, scale, hourly_rate, is_primary")
    .in("user_id", ids);
  console.log("staff_role_rates:", check);
  const { data: checkPay } = await sb
    .from("staff_pay_rates")
    .select("hourly_rate, role_label")
    .in("user_id", ids);
  console.log("staff_pay_rates:", checkPay);
  console.log("OK — John @ £25/h Support Worker");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
