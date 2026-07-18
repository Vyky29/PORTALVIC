#!/usr/bin/env node
/**
 * Parent portal smoke — home + all linked participants load.
 *
 * Checks:
 *   1) parent-portal-sign-in (master PIN) for demo children
 *   2) parent-portal-home-load returns every contact linked in DB
 *   3) parent-portal-participant-detail hub loads for each child
 *   4) sample multi-child parents (mint session) also load home + detail
 *
 *   node database/local-vault/smoke-parent-portal-participants.mjs
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY
 * Optional: PARENT_PORTAL_MASTER_PIN (default 29031988)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const results = [];
const startedAt = new Date().toISOString();

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

function log(step, ok, detail) {
  const row = { step, ok: !!ok, detail: detail == null ? "" : String(detail) };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${row.detail ? " — " + row.detail : ""}`);
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = readEnv("SUPABASE_ANON_KEY");
const masterPin = (readEnv("PARENT_PORTAL_MASTER_PIN") || "29031988").replace(/\D/g, "") || "29031988";

if (!serviceKey || !anonKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fnBase = url.replace(/\/$/, "") + "/functions/v1";

async function callFn(name, { sessionToken, body, timeoutMs } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 45000);
  try {
    const headers = {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    };
    if (sessionToken) headers["x-parent-portal-session"] = sessionToken;
    const res = await fetch(`${fnBase}/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json, ok: res.ok && !!(json && json.ok !== false) };
  } finally {
    clearTimeout(t);
  }
}

async function mintParentSession(parentPersonId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  await admin
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("parent_person_id", parentPersonId)
    .is("revoked_at", null);
  const { error } = await admin.from("portal_parent_portal_sessions").insert({
    parent_person_id: parentPersonId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw new Error("session mint failed: " + error.message);
  return token;
}

async function dbChildrenForParent(parentPersonId) {
  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, child_display, in_class, parent_display")
    .eq("parent_person_id", parentPersonId)
    .order("child_display", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function smokeParent(label, parentPersonId, { viaSignInFirstName } = {}) {
  let sessionToken = "";
  if (viaSignInFirstName) {
    const sign = await callFn("parent-portal-sign-in", {
      body: { participant_first_name: viaSignInFirstName, login_pin: masterPin },
    });
    const token = sign.json && (sign.json.session_token || sign.json.token);
    const ok = sign.status === 200 && !!token;
    log(`${label}: sign-in`, ok, ok ? `status=${sign.status}` : JSON.stringify(sign.json || { status: sign.status }).slice(0, 180));
    if (!ok) return { ok: false, children: [] };
    sessionToken = token;
  } else {
    sessionToken = await mintParentSession(parentPersonId);
    log(`${label}: mint-session`, true, parentPersonId);
  }

  const dbKids = await dbChildrenForParent(parentPersonId);
  const home = await callFn("parent-portal-home-load", {
    sessionToken,
    body: {},
    timeoutMs: 60000,
  });
  const children = (home.json && home.json.children) || [];
  const homeOk = home.status === 200 && Array.isArray(children);
  log(
    `${label}: home-load`,
    homeOk,
    homeOk
      ? `${children.length} children (db=${dbKids.length})`
      : JSON.stringify(home.json || { status: home.status }).slice(0, 220),
  );
  if (!homeOk) return { ok: false, children: [] };

  const homeIds = new Set(children.map((c) => String(c.contact_id || "")));
  const dbIds = new Set(dbKids.map((c) => String(c.contact_id || "")));
  const missingFromHome = [...dbIds].filter((id) => !homeIds.has(id));
  const extraInHome = [...homeIds].filter((id) => !dbIds.has(id));
  log(
    `${label}: home matches DB contacts`,
    missingFromHome.length === 0 && extraInHome.length === 0,
    missingFromHome.length || extraInHome.length
      ? `missing=${missingFromHome.join(",") || "—"} extra=${extraInHome.join(",") || "—"}`
      : children.map((c) => c.display_name || c.contact_id).join(" · "),
  );

  let allDetailOk = true;
  for (const child of children) {
    const cid = String(child.contact_id || "");
    const detail = await callFn("parent-portal-participant-detail", {
      sessionToken,
      body: { contact_id: cid, sections: ["hub", "general"] },
      timeoutMs: 90000,
    });
    const dOk =
      detail.status === 200 &&
      detail.json &&
      detail.json.ok !== false &&
      detail.json.participant &&
      String(detail.json.participant.contact_id || "") === cid;
    if (!dOk) allDetailOk = false;
    const access = detail.json && detail.json.portal_access;
    const name =
      (detail.json && detail.json.participant && detail.json.participant.display_name) ||
      child.display_name ||
      cid;
    log(
      `${label}: detail ${name}`,
      dOk,
      dOk
        ? `access=${access || "?"} in_class=${child.in_class}`
        : JSON.stringify(detail.json || { status: detail.status }).slice(0, 220),
    );
  }

  return { ok: homeOk && missingFromHome.length === 0 && allDetailOk, children };
}

async function topMultiChildParents(limit = 4) {
  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select("parent_person_id, child_display, contact_id")
    .not("parent_person_id", "is", null)
    .limit(2000);
  if (error) throw new Error(error.message);
  const byParent = new Map();
  for (const row of data || []) {
    const pid = String(row.parent_person_id || "").trim();
    if (!pid) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(row);
  }
  return [...byParent.entries()]
    .map(([parent_person_id, rows]) => ({ parent_person_id, n: rows.length, rows }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

async function main() {
  console.log("Parent portal participants smoke @", url);
  console.log("started", startedAt);

  // Demo family (Victor Matilla)
  await smokeParent("demo-victor", "parent-victor-matilla-demo", {
    viaSignInFirstName: "Eliademo",
  });

  // Broadcast / test Elia — find parent_person_id
  const { data: eliaTest } = await admin
    .from("portal_parent_contacts")
    .select("parent_person_id, contact_id, child_display")
    .eq("contact_id", "elia-test-broadcast")
    .maybeSingle();
  if (eliaTest && eliaTest.parent_person_id) {
    await smokeParent("elia-test", eliaTest.parent_person_id, {
      viaSignInFirstName: "Elia",
    });
  } else {
    log("elia-test: found contact", false, "elia-test-broadcast missing or no parent");
  }

  // Multi-child parents (mint session; no PIN needed)
  const multi = await topMultiChildParents(4);
  log(
    "sample multi-child parents",
    multi.length > 0,
    multi.map((m) => `${m.parent_person_id}×${m.n}`).join(", ") || "none",
  );
  for (const m of multi) {
    // Skip demo already covered
    if (m.parent_person_id === "parent-victor-matilla-demo") continue;
    if (eliaTest && m.parent_person_id === eliaTest.parent_person_id) continue;
    await smokeParent(`multi:${m.parent_person_id}`, m.parent_person_id);
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    url,
    pass: results.filter((r) => r.ok).length,
    fail: failed.length,
    results,
  };
  const outDir = path.join(root, "database/local-vault/tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "smoke-parent-portal-participants-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\nReport:", outPath);
  console.log(`Summary: ${report.pass} pass · ${report.fail} fail`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
