#!/usr/bin/env node
/**
 * Term feedback audit (since 2026-06-01) → CSV for Victor / Dan review.
 * Read-only unless --apply-cleanup is passed (dedupe + orphan quick marks).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SINCE = "2026-06-01";
const OUT_CSV = path.join(__dirname, "term-feedback-audit-since-2026-06-01.csv");
const OUT_DEDUPE_CSV = path.join(__dirname, "term-feedback-dedupe-deleted-2026-06-01.csv");

function readSecrets() {
  for (const rel of ["local-secrets/secrets.env", "database/local-vault/secrets.env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    return Object.fromEntries(
      fs
        .readFileSync(p, "utf8")
        .split(/\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1)];
        })
    );
  }
  throw new Error("Missing secrets.env (local-secrets/ or database/local-vault/)");
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsv(cols) {
  return cols.map(csvEscape).join(",");
}

const DEMO_SNIPPET = "arrived happy";
const NA_RE = /^\s*NA\s*$/i;

function classify(row, dupRank, hasFeedbackForQm) {
  const flags = [];
  const pf = String(row.positive_feedback || "").trim();
  const rel = String(row.relevant_information || "").trim();
  const narr = String(row.session_narrative || "").trim();
  const att = String(row.attendance || "").trim();

  if (dupRank > 1) flags.push("duplicate_key_keep_earliest");
  if (dupRank === 1 && row._dup_group_size > 1) flags.push("duplicate_key_canonical");

  if (pf.toLowerCase().includes(DEMO_SNIPPET) && att.toLowerCase() === "yes") {
    flags.push("demo_template_arrived_happy");
  }
  if (NA_RE.test(pf) || NA_RE.test(rel)) {
    const byDan = by.includes("dan");
    const hasNarr = !!narr;
    const hasRealRel = !!rel.replace(/NA/i, "").trim();
    if (byDan && (hasNarr || hasRealRel)) {
      flags.push("dan_legacy_or_narrative_ok");
    } else if (byDan) {
      flags.push("dan_legacy_minimal_na");
    } else if (!hasNarr && !hasRealRel) flags.push("na_only_fields");
    else flags.push("na_in_positive_or_rel");
  }
  if (att.toLowerCase() === "no") flags.push("attendance_no_legitimate");

  const by = String(row.completed_by_name || "").toLowerCase();
  if (by.includes("victor")) flags.push("completed_by_victor");

  if (!flags.length) flags.push("ok");
  return flags.join("|");
}

function classifyQuickMark(qm, hasFeedback) {
  if (hasFeedback) return "redundant_quick_mark_feedback_exists";
  return "orphan_quick_mark_no_feedback";
}

async function main() {
  const apply = process.argv.includes("--apply-cleanup");
  const env = readSecrets();
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: feedback, error: fbErr } = await sb
    .from("session_feedback")
    .select(
      "id,client_name,session_date,session_time,service,attendance,engagement_rating,positive_feedback,relevant_information,session_narrative,completed_by_name,portal_session_key,created_at"
    )
    .gte("session_date", SINCE)
    .order("session_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (fbErr) throw fbErr;

  const rows = feedback || [];
  const keyStaffGroups = new Map();
  for (const r of rows) {
    const k = `${r.portal_session_key}||${r.completed_by_name || ""}`;
    if (!keyStaffGroups.has(k)) keyStaffGroups.set(k, []);
    keyStaffGroups.get(k).push(r);
  }

  const dupRankById = new Map();
  const toDeleteDupes = [];
  for (const [, group] of keyStaffGroups) {
    group.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    group.forEach((r, i) => {
      dupRankById.set(r.id, i + 1);
      r._dup_group_size = group.length;
      if (i > 0) toDeleteDupes.push(r);
    });
  }

  const { data: qmRows, error: qmErr } = await sb
    .from("portal_staff_session_quick_marks")
    .select("id,staff_user_id,session_date,portal_session_key,mark_type,created_at")
    .eq("mark_type", "feedback_done")
    .gte("session_date", SINCE);
  if (qmErr) throw qmErr;

  const feedbackKeys = new Set(rows.map((r) => String(r.portal_session_key || "").trim()).filter(Boolean));

  function feedbackExistsForQuickMark(k) {
    const key = String(k || "").trim();
    if (!key) return false;
    if (feedbackKeys.has(key)) return true;
    const parts = key.split("|");
    if (parts.length >= 4 && /^\d/.test(parts[1])) {
      const loose = `${parts[0]}|${parts.slice(2).join("|")}`;
      if (feedbackKeys.has(loose)) return true;
    }
    return false;
  }

  const redundantQm = (qmRows || []).filter((qm) => feedbackExistsForQuickMark(qm.portal_session_key));
  const orphanQm = (qmRows || []).filter((qm) => !feedbackExistsForQuickMark(qm.portal_session_key));

  const header = [
    "category",
    "session_date",
    "session_time",
    "client_name",
    "completed_by_name",
    "portal_session_key",
    "attendance",
    "positive_feedback_preview",
    "relevant_information_preview",
    "created_at",
    "row_id",
    "dup_rank_in_key_group",
    "dup_group_size",
    "recommended_action",
  ];

  const csvLines = [rowToCsv(header)];

  for (const r of rows) {
    const rank = dupRankById.get(r.id) || 1;
    const flags = classify(r, rank, false);
    let action = "keep";
    if (flags.includes("duplicate_key_keep_earliest")) action = "delete_duplicate";
    csvLines.push(
      rowToCsv([
        flags,
        r.session_date,
        r.session_time,
        r.client_name,
        r.completed_by_name,
        r.portal_session_key,
        r.attendance,
        String(r.positive_feedback || "").slice(0, 120),
        String(r.relevant_information || "").slice(0, 120),
        r.created_at,
        r.id,
        rank,
        r._dup_group_size || 1,
        action,
      ])
    );
  }

  for (const qm of redundantQm) {
    csvLines.push(
      rowToCsv([
        classifyQuickMark(qm, true),
        qm.session_date,
        "",
        "",
        "",
        qm.portal_session_key,
        "",
        "",
        "",
        qm.created_at,
        qm.id,
        "",
        "",
        "delete_redundant_quick_mark",
      ])
    );
  }

  fs.writeFileSync(OUT_CSV, csvLines.join("\n") + "\n", "utf8");

  const summary = {
    since: SINCE,
    feedback_rows: rows.length,
    duplicate_groups: [...keyStaffGroups.values()].filter((g) => g.length > 1).length,
    duplicate_rows_to_delete: toDeleteDupes.length,
    redundant_quick_marks: redundantQm.length,
    orphan_quick_marks: orphanQm.length,
    flagged_demo_template: rows.filter((r) =>
      String(r.positive_feedback || "")
        .toLowerCase()
        .includes(DEMO_SNIPPET)
    ).length,
    flagged_na_fields: rows.filter(
      (r) => NA_RE.test(String(r.positive_feedback || "")) || NA_RE.test(String(r.relevant_information || ""))
    ).length,
    flagged_victor: rows.filter((r) => String(r.completed_by_name || "").toLowerCase().includes("victor")).length,
    csv: OUT_CSV,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("\nDry run only. Pass --apply-cleanup to delete duplicate feedback rows + redundant quick marks.");
    return;
  }

  if (toDeleteDupes.length) {
    const delHeader = ["id", "session_date", "client_name", "completed_by_name", "portal_session_key", "created_at"];
    const delLines = [rowToCsv(delHeader)];
    for (const r of toDeleteDupes) {
      delLines.push(
        rowToCsv([r.id, r.session_date, r.client_name, r.completed_by_name, r.portal_session_key, r.created_at])
      );
    }
    fs.writeFileSync(OUT_DEDUPE_CSV, delLines.join("\n") + "\n", "utf8");

    const ids = toDeleteDupes.map((r) => r.id);
    const { error: delErr } = await sb.from("session_feedback").delete().in("id", ids);
    if (delErr) throw delErr;
    console.log("Deleted duplicate session_feedback rows:", ids.length, "→", OUT_DEDUPE_CSV);
  }

  if (redundantQm.length) {
    const qmIds = redundantQm.map((r) => r.id);
    const { error: qmDelErr } = await sb.from("portal_staff_session_quick_marks").delete().in("id", qmIds);
    if (qmDelErr) throw qmDelErr;
    console.log("Deleted redundant feedback_done quick marks:", qmIds.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
