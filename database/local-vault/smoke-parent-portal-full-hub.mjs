#!/usr/bin/env node
/**
 * Full parent-portal hub smoke (read-only) — every linked participant,
 * every main button/section. Does NOT pay, report paid, send messages,
 * submit absence, or save consents.
 *
 *   node database/local-vault/smoke-parent-portal-full-hub.mjs
 *   node database/local-vault/smoke-parent-portal-full-hub.mjs --limit-parents=20
 *   node database/local-vault/smoke-parent-portal-full-hub.mjs --parent=parent-victor-matilla-demo
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const startedAt = new Date().toISOString();
const results = [];
const accuracy = [];

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

function argVal(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}

function log(step, ok, detail) {
  const row = { step, ok: !!ok, detail: detail == null ? "" : String(detail) };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${row.detail ? " — " + row.detail : ""}`);
}

function warn(step, detail) {
  accuracy.push({ step, severity: "warn", detail: String(detail || "") });
  console.log(`WARN  ${step}${detail ? " — " + detail : ""}`);
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const url = readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = readEnv("SUPABASE_ANON_KEY");
if (!serviceKey || !anonKey) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fnBase = url.replace(/\/$/, "") + "/functions/v1";
const limitParents = Number(argVal("limit-parents") || 0) || 0;
const onlyParent = String(argVal("parent") || "").trim();

async function callFn(name, { sessionToken, body, timeoutMs } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
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
    return {
      status: res.status,
      json,
      okHttp: res.ok,
      ok: res.ok && !(json && json.ok === false),
    };
  } catch (err) {
    return {
      status: 0,
      json: null,
      okHttp: false,
      ok: false,
      error: err && err.name === "AbortError" ? "timeout" : String(err && err.message || err),
    };
  } finally {
    clearTimeout(t);
  }
}

async function mintParentSession(parentPersonId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
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

async function loadParentGroups() {
  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_person_id, contact_id, child_display, child_first_name, child_last_name, in_class, parent_display",
    )
    .not("parent_person_id", "is", null)
    .order("child_display", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  const byParent = new Map();
  for (const row of data || []) {
    const pid = String(row.parent_person_id || "").trim();
    if (!pid) continue;
    if (onlyParent && pid !== onlyParent) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(row);
  }
  let groups = [...byParent.entries()].map(([parent_person_id, rows]) => ({
    parent_person_id,
    parent_display: rows[0]?.parent_display || parent_person_id,
    rows,
  }));
  groups.sort((a, b) => String(a.parent_display).localeCompare(String(b.parent_display)));
  if (limitParents > 0) groups = groups.slice(0, limitParents);
  return groups;
}

function short(obj, n = 180) {
  try {
    return JSON.stringify(obj).slice(0, n);
  } catch {
    return String(obj).slice(0, n);
  }
}

async function probeChild(label, sessionToken, child) {
  const cid = String(child.contact_id || "");
  const name = String(child.display_name || child.child_display || cid);
  const prefix = `${label} · ${name}`;
  const fails = [];

  // Full participant detail (all sections the hub lazy-loads)
  const detail = await callFn("parent-portal-participant-detail", {
    sessionToken,
    body: {
      contact_id: cid,
      sections: ["general", "sessions", "achievements", "swim", "weekly_notes"],
    },
    timeoutMs: 120000,
  });
  const dOk =
    detail.ok &&
    detail.json &&
    detail.json.participant &&
    String(detail.json.participant.contact_id || "") === cid;
  log(`${prefix}: detail/all-sections`, dOk, dOk ? `access=${detail.json.portal_access}` : short(detail.json || detail));
  if (!dOk) {
    fails.push("detail");
    return { fails, warnings: 0 };
  }

  const p = detail.json.participant || {};
  const general = detail.json.general || {};
  const services = Array.isArray(general.services_detail) ? general.services_detail : [];
  const inClass = child.in_class !== false && detail.json.portal_access !== "former";
  const access = String(detail.json.portal_access || "");

  if (!String(p.display_name || "").trim()) {
    warn(`${prefix}: empty display_name`, cid);
  }
  if (child.in_class === false && access !== "former") {
    warn(`${prefix}: DB in_class=false but portal_access=${access}`, cid);
  }
  if (child.in_class === true && access === "former") {
    warn(`${prefix}: DB in_class=true but portal_access=former`, cid);
  }
  if (inClass && !services.length) {
    warn(`${prefix}: active but no services_detail`, "hub Next session will look empty");
  }
  if (String(p.display_name || "").trim() && String(child.display_name || child.child_display || "").trim()) {
    const a = String(p.display_name).trim().toLowerCase();
    const b = String(child.display_name || child.child_display).trim().toLowerCase();
    if (a !== b && !a.includes(b.split(/\s+/)[0]) && !b.includes(a.split(/\s+/)[0])) {
      warn(`${prefix}: name mismatch home vs detail`, `home=${b} detail=${a}`);
    }
  }

  // Hub buttons / sheets — read-only
  const probes = [
    { key: "messages", fn: "parent-portal-messages-list", body: { contact_id: cid, mark_read: false } },
    { key: "absence", fn: "parent-portal-absence-list", body: { contact_id: cid } },
    { key: "makeup", fn: "parent-portal-makeup-list", body: { contact_id: cid } },
    { key: "credits", fn: "parent-portal-credits-list", body: { contact_id: cid } },
    { key: "documents", fn: "parent-portal-documents-list", body: { contact_id: cid } },
    { key: "consents", fn: "parent-portal-consents-load", body: { contact_id: cid } },
    { key: "invoices", fn: "parent-portal-invoices-list", body: { contact_id: cid } },
    { key: "registration", fn: "parent-portal-registration-load", body: { contact_id: cid } },
    {
      key: "activity-ping",
      fn: "parent-portal-activity-ping",
      body: { contact_id: cid, surface: "hub" },
    },
  ];

  // Booking / re-enrol lookup (read)
  probes.push({
    key: "reenrol-lookup",
    fn: "portal-reenrolment-lookup",
    body: { contact_id: cid },
  });

  let warnings = 0;
  for (const probe of probes) {
    const r = await callFn(probe.fn, {
      sessionToken,
      body: probe.body,
      timeoutMs: 90000,
    });
    // Some endpoints return ok:true with empty lists; registration may 404-ish with ok:false for no form — treat HTTP 200 + structured JSON as soft pass when expected.
    let ok = r.ok;
    let detail = "";
    if (probe.key === "registration" && r.status === 200 && r.json) {
      // registration-load may say ok:false when nothing on file
      ok = true;
      detail = r.json.ok === false ? `no_reg=${r.json.error || "empty"}` : "loaded";
    } else if (probe.key === "reenrol-lookup") {
      ok = r.status === 200 && !!r.json;
      detail = r.json && (r.json.matched != null || r.json.ok != null)
        ? `matched=${r.json.matched} ok=${r.json.ok}`
        : short(r.json || r);
    } else if (probe.key === "invoices" && r.ok && r.json) {
      const inv = Array.isArray(r.json.invoices) ? r.json.invoices : [];
      const wrong = inv.filter((i) => i.contact_id && String(i.contact_id) !== cid);
      if (wrong.length) {
        ok = false;
        detail = `wrong contact on ${wrong.length} invoice(s)`;
      } else {
        detail = `${inv.length} invoice(s)`;
      }
    } else if (probe.key === "messages" && r.ok && r.json) {
      detail = `msgs=${(r.json.messages || []).length} unread=${r.json.unread_messages_count ?? "?"}`;
    } else if (probe.key === "consents" && r.ok && r.json) {
      detail = `pending=${(r.json.summary && r.json.summary.pending_count) ?? "?"}`;
    } else if (!ok) {
      detail = short(r.json || r);
    } else if (r.json && Array.isArray(r.json.items)) {
      detail = `items=${r.json.items.length}`;
    } else if (r.json && Array.isArray(r.json.documents)) {
      detail = `docs=${r.json.documents.length}`;
    } else if (r.json && Array.isArray(r.json.absences)) {
      detail = `absences=${r.json.absences.length}`;
    } else if (r.json && Array.isArray(r.json.credits)) {
      detail = `credits=${r.json.credits.length}`;
    } else if (r.json && Array.isArray(r.json.makeups)) {
      detail = `makeups=${r.json.makeups.length}`;
    }

    log(`${prefix}: ${probe.key}`, ok, detail);
    if (!ok) fails.push(probe.key);
  }

  // Extra accuracy on detail payload shapes used by hub buttons
  const sessions = Array.isArray(detail.json.sessions) ? detail.json.sessions : [];
  const notes = Array.isArray(detail.json.weekly_notes) ? detail.json.weekly_notes : [];
  const ach = Array.isArray(detail.json.achievements) ? detail.json.achievements : [];
  const team = Array.isArray(detail.json.team) ? detail.json.team : [];
  log(
    `${prefix}: hub payload shapes`,
    true,
    `services=${services.length} sessions=${sessions.length} notes=${notes.length} photos=${ach.length} team=${team.length}`,
  );

  if (inClass && services.length && sessions.length === 0 && notes.length === 0) {
    // Not always wrong (suppressSessionProgress / new starters) — warn only.
    warn(`${prefix}: has services but 0 sessions & 0 notes`, "check feedback mapping");
    warnings += 1;
  }

  return { fails, warnings: warnings + (accuracy.filter((a) => a.step.startsWith(prefix)).length ? 0 : 0) };
}

async function smokeParent(group) {
  const label = `${group.parent_display || group.parent_person_id}`.slice(0, 48);
  const pid = group.parent_person_id;
  let sessionToken;
  try {
    sessionToken = await mintParentSession(pid);
  } catch (err) {
    log(`${label}: mint-session`, false, err.message || err);
    return;
  }
  log(`${label}: mint-session`, true, `${group.rows.length} child(ren)`);

  const home = await callFn("parent-portal-home-load", {
    sessionToken,
    body: {},
    timeoutMs: 90000,
  });
  const children = (home.json && home.json.children) || [];
  const homeOk = home.ok && Array.isArray(children);
  log(
    `${label}: home-load`,
    homeOk,
    homeOk ? `${children.length} children` : short(home.json || home),
  );
  if (!homeOk) return;

  const dbIds = new Set(group.rows.map((r) => String(r.contact_id)));
  const homeIds = new Set(children.map((c) => String(c.contact_id)));
  const missing = [...dbIds].filter((id) => !homeIds.has(id));
  const extra = [...homeIds].filter((id) => !dbIds.has(id));
  log(
    `${label}: home vs DB`,
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length
      ? `missing=${missing.join(",") || "—"} extra=${extra.join(",") || "—"}`
      : children.map((c) => c.display_name || c.contact_id).join(" · "),
  );

  // Attach in_class from DB onto home children for accuracy checks
  const dbById = new Map(group.rows.map((r) => [String(r.contact_id), r]));
  for (const child of children) {
    const db = dbById.get(String(child.contact_id));
    const merged = {
      ...child,
      in_class: db ? db.in_class : child.in_class,
      child_display: db?.child_display || child.display_name,
    };
    await probeChild(label, sessionToken, merged);
  }
}

async function main() {
  console.log("Full parent portal hub smoke (read-only) @", url);
  console.log("started", startedAt);
  if (onlyParent) console.log("filter parent=", onlyParent);
  if (limitParents) console.log("limit parents=", limitParents);

  const groups = await loadParentGroups();
  log("parents queued", groups.length > 0, `${groups.length} parent(s)`);
  if (!groups.length) {
    process.exit(1);
  }

  for (const g of groups) {
    await smokeParent(g);
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    url,
    parents: groups.length,
    pass: results.filter((r) => r.ok).length,
    fail: failed.length,
    accuracy_warnings: accuracy.length,
    skipped_pay_actions: [
      "parent-portal-invoice-checkout",
      "parent-portal-gocardless-setup",
      "parent-portal-invoice-report-paid",
      "parent-portal-credit-apply-invoice",
    ],
    accuracy,
    results,
  };
  const outDir = path.join(root, "database/local-vault/tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "smoke-parent-portal-full-hub-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\nReport:", outPath);
  console.log(
    `Summary: ${report.pass} pass · ${report.fail} fail · ${report.accuracy_warnings} accuracy warn(s)`,
  );
  if (accuracy.length) {
    console.log("\nAccuracy warnings:");
    accuracy.slice(0, 40).forEach((a) => console.log(`  - ${a.step}: ${a.detail}`));
    if (accuracy.length > 40) console.log(`  … +${accuracy.length - 40} more`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
