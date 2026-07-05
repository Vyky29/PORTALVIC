#!/usr/bin/env node
/** READ-ONLY: schedule_overrides for 2026-07-05 (Roberto / Yusuf). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
function readEnv(k){const p=path.join(root,"local-secrets/secrets.env");const l=fs.readFileSync(p,"utf8").split(/\r?\n/).find(x=>x.startsWith(k+"="));if(!l)throw new Error("missing "+k);return l.slice(k.length+1).trim();}
const admin=createClient(readEnv("SUPABASE_URL"),readEnv("SUPABASE_SERVICE_ROLE_KEY"));
const {data,error}=await admin.from("schedule_overrides").select("*").eq("session_date","2026-07-05");
if(error)throw error;
console.log("total overrides 2026-07-05:",data.length);
const cols = data.length ? Object.keys(data[0]) : [];
console.log("columns:",cols.join(", "));
for(const r of data){
  const blob=JSON.stringify(r).toLowerCase();
  if(blob.includes("roberto")||blob.includes("yusuf")||blob.includes("yusuf_ah")){
    console.log("\n---");
    console.log(JSON.stringify(r));
  }
}
