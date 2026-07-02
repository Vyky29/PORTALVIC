#!/usr/bin/env node
/**
 * Report: staff who signed the Calendar 2026/27 announcement and who saved the PDF.
 *
 *   node database/local-vault/report-calendar-2026-27-acks.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const ANNOUNCEMENT_ID = "a0270001-0001-4000-8000-0000000a2701";
const DOC_TYPE = "calendar_2026_27";

function readEnv(key) {
  const line = fs
    .readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

function nameOf(p) {
  return String(p.full_name || p.username || p.id || "").trim() || p.id;
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: acks, error: ackErr } = await admin
    .from("portal_staff_announcement_acks")
    .select("staff_id, signed_at, staff_full_name, staff_username")
    .eq("announcement_id", ANNOUNCEMENT_ID)
    .order("signed_at", { ascending: true });
  if (ackErr) throw ackErr;

  const staffIds = [...new Set((acks || []).map((r) => String(r.staff_id)).filter(Boolean))];

  const { data: docs, error: docErr } = await admin
    .from("documents")
    .select("user_id, created_at, title")
    .eq("document_type", DOC_TYPE)
    .is("hidden_by_user_at", null)
    .order("created_at", { ascending: true });
  if (docErr) throw docErr;

  const docByUser = new Map();
  for (const d of docs || []) {
    docByUser.set(String(d.user_id), d);
  }

  const { data: profs } = await admin
    .from("staff_profiles")
    .select("id, full_name, username")
    .in("id", [...new Set([...staffIds, ...(docs || []).map((d) => String(d.user_id))])]);

  const profById = new Map((profs || []).map((p) => [String(p.id), p]));

  console.log("\n=== Calendar 2026/27 — signed announcement ===\n");
  if (!acks?.length) {
    console.log("(none)");
  } else {
    for (const a of acks) {
      const p = profById.get(String(a.staff_id)) || {};
      const doc = docByUser.get(String(a.staff_id));
      console.log(
        [
          nameOf({ ...p, id: a.staff_id }),
          "signed:",
          a.signed_at || "?",
          doc ? "PDF: yes" : "PDF: no",
        ].join(" | "),
      );
    }
  }

  const signedSet = new Set(staffIds);
  const pdfOnly = (docs || []).filter((d) => !signedSet.has(String(d.user_id)));

  console.log("\n=== PDF in My Documents without announcement ack row ===\n");
  if (!pdfOnly.length) {
    console.log("(none)");
  } else {
    for (const d of pdfOnly) {
      const p = profById.get(String(d.user_id)) || {};
      console.log([nameOf({ ...p, id: d.user_id }), "saved:", d.created_at].join(" | "));
    }
  }

  console.log("\nSummary:");
  console.log("  Signed:", acks?.length || 0);
  console.log("  PDF saved:", docs?.length || 0);
  console.log(
    "  Signed but no PDF:",
    (acks || []).filter((a) => !docByUser.has(String(a.staff_id))).length,
  );
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
