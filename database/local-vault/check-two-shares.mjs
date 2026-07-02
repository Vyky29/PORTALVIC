#!/usr/bin/env node
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ids = [
  "f3250994-852c-483c-b33a-d7c23be7e37f", // Ikram
  "61339f9f-46b7-4fd7-b98f-c5a5382e3b4b", // Fadi 30 Jun
];
const { data } = await sb
  .from("portal_parent_feedback_share")
  .select("session_feedback_id, share_status, review_model, parent_message")
  .in("session_feedback_id", ids);
for (const row of data || []) {
  const msg = String(row.parent_message || "");
  console.log(row.session_feedback_id.slice(0, 8), row.share_status, row.review_model, msg.slice(0, 80) + (msg.length > 80 ? "…" : ""));
}
