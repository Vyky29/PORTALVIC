#!/usr/bin/env node
/**
 * Read-only smoke check: Sevitha office portal backend (Supabase SQL + document hub Edge Functions).
 * Does not redeploy or mutate production.
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const baseUrl = "https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1";

const REQUIRED_FUNCTIONS = [
  "portal-admin-hr-files-list",
  "portal-admin-expenses-list",
  "portal-admin-onboarding-documents-list",
  "portal-admin-hr-file-signed-url",
];

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log("OK:", msg);
}

console.log("=== Sevitha office portal verify ===\n");

// 1) staff_profiles.dashboard_route
try {
  const out = run(
    `npx supabase db query --linked --output json "select au.email, sp.dashboard_route, sp.app_role from auth.users au join public.staff_profiles sp on sp.id = au.id where lower(au.email) = 'sevitha@clubsensational.org';"`,
  );
  const parsed = JSON.parse(out);
  const rows = parsed.rows || parsed;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    fail("No staff_profiles row for sevitha@clubsensational.org");
  } else if (row.dashboard_route !== "office_portal.html") {
    fail(`dashboard_route is ${row.dashboard_route} (expected office_portal.html)`);
  } else if (String(row.app_role || "").toLowerCase() !== "admin") {
    fail(`app_role is ${row.app_role} (expected admin)`);
  } else {
    ok(`Sevitha profile → ${row.dashboard_route}, app_role=${row.app_role}`);
  }
} catch (e) {
  fail(`DB profile check failed: ${e.message || e}`);
}

// 2) payslip RLS policies
try {
  const out = run(
    `npx supabase db query --linked --output json "select policyname from pg_policies where tablename = 'documents' and policyname like '%payslip%' order by policyname;"`,
  );
  const parsed = JSON.parse(out);
  const rows = parsed.rows || parsed;
  const names = (Array.isArray(rows) ? rows : []).map((r) => r.policyname);
  for (const need of ["documents_insert_admin_payslips", "documents_select_admin_payslips"]) {
    if (!names.includes(need)) fail(`Missing RLS policy ${need}`);
    else ok(`RLS policy ${need}`);
  }
} catch (e) {
  fail(`RLS check failed: ${e.message || e}`);
}

// 3) Edge Functions deployed (ACTIVE)
try {
  const list = run("npx supabase functions list --output json");
  const parsed = JSON.parse(list);
  const fns = Array.isArray(parsed) ? parsed : parsed.functions || [];
  for (const slug of REQUIRED_FUNCTIONS) {
    const hit = fns.find((f) => f.slug === slug || f.name === slug);
    if (!hit) fail(`Edge Function not deployed: ${slug}`);
    else if (String(hit.status || "").toUpperCase() !== "ACTIVE") {
      fail(`${slug} status=${hit.status}`);
    } else {
      ok(`${slug} ACTIVE (v${hit.version})`);
    }
  }
} catch (e) {
  fail(`functions list failed: ${e.message || e}`);
}

// 4) HTTP reachability (no JWT → gateway/function rejects)
(async () => {
  for (const slug of REQUIRED_FUNCTIONS) {
    try {
      const res = await fetch(`${baseUrl}/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401 || res.status === 403) {
        ok(`${slug} reachable (HTTP ${res.status} without session — expected)`);
      } else {
        fail(`${slug} unexpected HTTP ${res.status}`);
      }
    } catch (e) {
      fail(`${slug} HTTP error: ${e.message || e}`);
    }
  }

  console.log("\n=== Summary ===");
  if (process.exitCode) {
    console.log("Fix failures above before Sevitha tests document hub.");
    process.exit(process.exitCode);
  }
  console.log("Backend ready for Sevitha office portal (login test still required in browser).");
  console.log("Optional: npm run deploy:sevitha-document-hub — redeploy 4 Edge Functions if auth code changed.");
})();
