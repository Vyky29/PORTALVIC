#!/usr/bin/env node
/** One-off: list live announcements + teflon acks on Portal Supabase. */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../../local-secrets/secrets.env", import.meta.url), "utf8")
    .split(/\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: anns, error: e1 } = await sb
  .from("portal_staff_announcements")
  .select("id,title,message_type,on_ack_action,created_at")
  .order("created_at", { ascending: false });

if (e1) {
  console.error("announcements error", e1);
  process.exit(1);
}
console.log("ANNOUNCEMENTS:", JSON.stringify(anns, null, 2));

const { data: teflon } = await sb
  .from("staff_profiles")
  .select("id,username,full_name")
  .eq("username", "teflon")
  .maybeSingle();

if (teflon?.id) {
  const { data: acks } = await sb
    .from("portal_staff_announcement_acks")
    .select("*")
    .eq("user_id", teflon.id);
  console.log("TEFLON_ACKS:", JSON.stringify(acks, null, 2));

  const { data: push } = await sb
    .from("portal_push_subscriptions")
    .select("id,created_at")
    .eq("user_id", teflon.id);
  console.log("TEFLON_PUSH:", JSON.stringify(push, null, 2));
}
