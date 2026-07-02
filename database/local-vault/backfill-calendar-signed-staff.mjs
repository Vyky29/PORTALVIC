#!/usr/bin/env node
/**
 * Upload Calendar 2026/27 PDF to My Documents for staff who signed the announcement
 * but have no calendar_2026_27 row (browser save failed before poster was live).
 *
 * Default: dry-run. Pass --execute to write.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const EXECUTE = process.argv.includes("--execute");
const ANNOUNCEMENT_ID = "a0270001-0001-4000-8000-0000000a2701";
const DOC_TYPE = "calendar_2026_27";
const DOC_TITLE = "Calendar 2026/27";
const POSTER_PATH = path.join(root, "working_ui/portal/assets/calendar-2026-27-poster.png");

function readEnv(key) {
  const line = fs
    .readFileSync(path.join(root, "local-secrets/secrets.env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

function posterPdfBytes() {
  if (!fs.existsSync(POSTER_PATH)) throw new Error("poster missing: " + POSTER_PATH);
  const b64 = fs.readFileSync(POSTER_PATH).toString("base64");
  const w = 682;
  const h = 1024;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [w, h],
    compress: true,
  });
  pdf.addImage(`data:image/png;base64,${b64}`, "PNG", 0, 0, w, h);
  return new Uint8Array(pdf.output("arraybuffer"));
}

async function main() {
  const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: signed, error: signErr } = await admin
    .from("portal_staff_announcement_acks")
    .select("staff_id")
    .eq("announcement_id", ANNOUNCEMENT_ID);
  if (signErr) throw signErr;

  const staffIds = [...new Set((signed || []).map((r) => String(r.staff_id)).filter(Boolean))];
  if (!staffIds.length) {
    console.log("No calendar signatures found.");
    return;
  }

  const { data: existing, error: docErr } = await admin
    .from("documents")
    .select("user_id")
    .in("user_id", staffIds)
    .eq("document_type", DOC_TYPE)
    .is("hidden_by_user_at", null);
  if (docErr) throw docErr;

  const have = new Set((existing || []).map((r) => String(r.user_id)));
  const missing = staffIds.filter((id) => !have.has(id));
  if (!missing.length) {
    console.log("All signed staff already have Calendar 2026/27 in My Documents.");
    return;
  }

  const { data: profs } = await admin
    .from("staff_profiles")
    .select("id, full_name, username")
    .in("id", missing);

  const pdf = posterPdfBytes();
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`Missing calendar PDF for ${missing.length} signed staff.`);

  for (const p of profs || []) {
    const id = String(p.id);
    console.log(`  ${EXECUTE ? "upload" : "plan"} ${p.full_name || p.username || id}`);
    if (!EXECUTE) continue;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${id}/calendar-2026-27/${stamp}_Calendar_2026_27.pdf`;
    const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error(`upload ${p.full_name}: ${upErr.message}`);

    const { error: insErr } = await admin.from("documents").insert({
      user_id: id,
      document_type: DOC_TYPE,
      category: "documents",
      title: DOC_TITLE,
      related_date: "2026-09-05",
      related_session_key: "calendar-2026-27",
      file_url: storagePath,
      source_page: "calendar-2026-27",
    });
    if (insErr) throw new Error(`document ${p.full_name}: ${insErr.message}`);
  }

  console.log("Done.");
  if (!EXECUTE) console.log("Re-run with --execute to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
