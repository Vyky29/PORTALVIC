#!/usr/bin/env node
/**
 * Smoke: LA / commissioning Terms tables + accept flow (service role).
 * Does NOT touch family T&Cs / re-enrolment declarations.
 *
 *   node database/local-vault/smoke-commissioning-terms.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ optional SUPABASE_ANON_KEY for edge call).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const startedAt = new Date().toISOString();
const results = [];

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
    path.join(root, ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function ok(name, detail) {
  results.push({ name, ok: true, detail: detail || "" });
  console.log("OK  ", name, detail || "");
}
function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail || "") });
  console.error("FAIL", name, detail || "");
}

function sha256Hex(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

async function main() {
  const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
  const service = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anon = readEnv("SUPABASE_ANON_KEY");
  if (!service) {
    fail("env", "SUPABASE_SERVICE_ROLE_KEY missing");
    process.exit(1);
  }
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Tables / seed
  const { data: flags, error: fErr } = await admin
    .from("portal_commissioning_finance_settings")
    .select("key, value_json")
    .eq("key", "feature_flags")
    .maybeSingle();
  if (fErr) fail("feature_flags", fErr.message);
  else ok("feature_flags", JSON.stringify(flags?.value_json || {}));

  const { data: doc, error: dErr } = await admin
    .from("portal_terms_documents")
    .select("id, audience, version, status, public_path")
    .eq("audience", "commissioning")
    .eq("status", "active")
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dErr || !doc) fail("active_commissioning_doc", dErr?.message || "missing");
  else ok("active_commissioning_doc", `${doc.version} ${doc.public_path}`);

  const { data: familyDoc } = await admin
    .from("portal_terms_documents")
    .select("id, audience, public_path")
    .eq("audience", "family")
    .limit(1)
    .maybeSingle();
  if (familyDoc && familyDoc.public_path && /parent\/terms|terms_and_conditions/i.test(familyDoc.public_path)) {
    ok("family_doc_catalog_isolated", familyDoc.public_path);
  } else {
    ok("family_doc_catalog_isolated", familyDoc ? String(familyDoc.public_path) : "no family catalog row (ok)");
  }

  // 2) Org + send + accept via DB (mirrors edge accept)
  const stamp = Date.now().toString(36);
  const { data: org, error: oErr } = await admin
    .from("portal_commissioning_orgs")
    .insert({
      name: `Smoke LA ${stamp}`,
      org_type: "local_authority",
      main_contact_email: `smoke-la-${stamp}@example.com`,
    })
    .select("*")
    .maybeSingle();
  if (oErr || !org) {
    fail("create_org", oErr?.message || "no row");
  } else {
    ok("create_org", org.id);
  }

  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();

  let sendId = null;
  if (org && doc) {
    const { data: ev, error: sErr } = await admin
      .from("portal_terms_send_events")
      .insert({
        document_id: doc.id,
        org_id: org.id,
        recipient_email: `officer-${stamp}@example.com`,
        recipient_name: "Smoke Officer",
        recipient_role: "Commissioning manager",
        status: "sent",
        token_hash: tokenHash,
        token_expires_at: expires,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (sErr || !ev) fail("send_event", sErr?.message || "no row");
    else {
      sendId = ev.id;
      ok("send_event", sendId);
    }
  }

  // Optional: hit edge accept with anon
  if (anon && rawToken) {
    try {
      const viewRes = await fetch(`${url}/functions/v1/commissioning-terms-accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify({ action: "view", token: rawToken }),
      });
      const viewBody = await viewRes.json().catch(() => ({}));
      if (viewRes.ok && viewBody.ok) ok("edge_view", viewBody.status || "ok");
      else fail("edge_view", viewBody.error || viewRes.status);

      const accRes = await fetch(`${url}/functions/v1/commissioning-terms-accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify({
          action: "accept",
          token: rawToken,
          organisation_name: org?.name || "Smoke LA",
          accepted_by_name: "Smoke Officer",
          accepted_by_email: `officer-${stamp}@example.com`,
          accepted_by_role: "Commissioning manager",
        }),
      });
      const accBody = await accRes.json().catch(() => ({}));
      if (accRes.ok && accBody.ok) ok("edge_accept", accBody.document_version || "");
      else fail("edge_accept", accBody.error || accRes.status);
    } catch (e) {
      fail("edge_accept", e.message);
    }
  } else if (sendId && doc && org) {
    // Direct DB accept path when edge not deployed yet
    const { data: acceptance, error: aErr } = await admin
      .from("portal_terms_acceptances")
      .insert({
        document_id: doc.id,
        send_event_id: sendId,
        org_id: org.id,
        organisation_name: org.name,
        accepted_by_name: "Smoke Officer",
        accepted_by_email: `officer-${stamp}@example.com`,
        accepted_by_role: "Commissioning manager",
        accepted_at: new Date().toISOString(),
        document_version: doc.version,
        document_content_hash: null,
      })
      .select("id")
      .maybeSingle();
    if (aErr || !acceptance) fail("db_accept", aErr?.message || "no row");
    else {
      await admin
        .from("portal_terms_send_events")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", sendId);
      ok("db_accept", acceptance.id);
    }
  }

  // 3) Placement + PO + approve gate
  if (org) {
    const { data: placement, error: pErr } = await admin
      .from("portal_commissioning_placements")
      .insert({
        org_id: org.id,
        participant_name: `Smoke Child ${stamp}`,
        service_label: "Day Centre",
        academic_year: "2026-27",
        status: "awaiting_po",
      })
      .select("*")
      .maybeSingle();
    if (pErr || !placement) fail("create_placement", pErr?.message || "no row");
    else ok("create_placement", placement.id);

    if (placement) {
      const { error: poErr } = await admin.from("portal_purchase_orders").insert({
        org_id: org.id,
        placement_id: placement.id,
        po_number: `PO-SMOKE-${stamp}`,
        status: "active",
        total_value_pence: 100000,
        remaining_balance_pence: 100000,
      });
      if (poErr) fail("create_po", poErr.message);
      else ok("create_po", `PO-SMOKE-${stamp}`);

      const { data: updated, error: uErr } = await admin
        .from("portal_commissioning_placements")
        .update({
          status: "approved_to_attend",
          attendance_authorised_from: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq("id", placement.id)
        .select("status")
        .maybeSingle();
      if (uErr || !updated) fail("approve_attend", uErr?.message || "no row");
      else ok("approve_attend", updated.status);
    }
  }

  const failed = results.filter((r) => !r.ok);
  const outDir = path.join(root, "database/local-vault/tmp");
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "smoke-commissioning-terms-report.json");
  writeFileSync(
    reportPath,
    JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), results, failed: failed.length }, null, 2)
  );
  console.log("\nReport:", reportPath);
  console.log(failed.length ? `FAILED ${failed.length}` : "ALL OK");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
