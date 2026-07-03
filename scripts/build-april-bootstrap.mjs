#!/usr/bin/env node
/**
 * Builds supabase/migrations/20260414120000_portal_april_bootstrap_consolidated.sql
 * from database/migrations/ April bootstrap sources (22 → consolidated, idempotent).
 * Run: node scripts/build-april-bootstrap.mjs
 */
import fs from "fs";
import path from "path";

const DB = "database/migrations";
const OUT =
  "supabase/migrations/20260414120000_portal_april_bootstrap_consolidated.sql";
const CONTRACT_TYPE_OUT =
  "supabase/migrations/20260607130100_portal_payroll_contract_type_column.sql";

function read(name) {
  return fs.readFileSync(path.join(DB, name), "utf8");
}

function stripTransactions(sql) {
  return sql
    .split("\n")
    .filter(
      (line) => !/^\s*begin;\s*$/i.test(line) && !/^\s*commit;\s*$/i.test(line)
    )
    .join("\n")
    .trim();
}

function coreProgrammeRls() {
  return `-- RLS clients/sessions/announcements (skip if legacy programme tables absent).
do $$
declare
  t text;
  pol text;
begin
  foreach t in array array['clients', 'sessions', 'announcements'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    pol := t || '_select_authenticated';
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('revoke select on table public.%I from anon', t);
    execute format(
      'revoke insert, update, delete on table public.%I from anon, authenticated',
      t
    );
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      pol,
      t
    );
  end loop;
end;
$$;`;
}

function section(title, source, sql) {
  return (
    `\n-- ---------------------------------------------------------------------------\n` +
    `-- ${title}\n` +
    `-- Source: database/migrations/${source}\n` +
    `-- ---------------------------------------------------------------------------\n\n` +
    sql +
    "\n"
  );
}

/** 60415 without the insert policy (60420 replaces it). */
function sessionFeedbackBase() {
  const raw = read("20260415_session_feedback.sql");
  return raw
    .replace(
      /drop policy if exists "session_feedback_insert_staff_lead"[\s\S]*?;\n\n/,
      ""
    )
    .trim();
}

/** Soften RLS guard: skip missing legacy tables instead of raising. */
function softenCoreRlsGuard(_sql) {
  return coreProgrammeRls();
}

const parts = [
  `-- Portal April bootstrap (consolidated, idempotent).
-- Merged from database/migrations/ for Supabase CLI chain (before 20260424*).
-- Prod Portal already has this schema (applied manually); use migration repair on linked prod.
-- Omitted: 60417 (superseded by 60420), 60421 (RPC duplicated in Jun 2026 migrations),
--           payroll Roberto/director data seeds, 60720 UPDATE rows (contract_type → 20260607130100).
-- Depends on: auth.users, public.staff_profiles; optional clients/sessions/announcements for RLS section.
-- Regenerate: node scripts/build-april-bootstrap.mjs

begin;`,
  section("session_feedback table + admin select", "20260415_session_feedback.sql", stripTransactions(sessionFeedbackBase())),
  section("session_feedback context columns", "20260416_session_feedback_context.sql", stripTransactions(read("20260416_session_feedback_context.sql"))),
  section("session_feedback nullable phase-2", "20260418_session_feedback_nullable_second_phase.sql", stripTransactions(read("20260418_session_feedback_nullable_second_phase.sql"))),
  section("cancellation_reports", "20260420_cancellation_reports.sql", stripTransactions(read("20260420_cancellation_reports.sql"))),
  section("incident_reports", "20260420_incident_reports.sql", stripTransactions(read("20260420_incident_reports.sql"))),
  section("portal auth generation + select own", "20260420_portal_auth_generation_and_review_select.sql", stripTransactions(read("20260420_portal_auth_generation_and_review_select.sql"))),
  section("session_feedback insert (ceo/admin)", "20260420_session_feedback_insert_rls_ceo_admin.sql", stripTransactions(read("20260420_session_feedback_insert_rls_ceo_admin.sql"))),
  section("venue_reviews", "20260422_venue_reviews.sql", stripTransactions(read("20260422_venue_reviews.sql"))),
  section("documents + storage", "20260423_create_documents_table_storage_and_policies.sql", stripTransactions(read("20260423_create_documents_table_storage_and_policies.sql"))),
  section(
    "RLS clients/sessions/announcements",
    "20260423_enable_rls_clients_sessions_announcements_select_authenticated.sql",
    softenCoreRlsGuard("")
  ),
  section("expense_claims", "20260423_expense_claims_backend.sql", stripTransactions(read("20260423_expense_claims_backend.sql"))),
  section("lead_session_reports", "20260423_lead_session_reports.sql", stripTransactions(read("20260423_lead_session_reports.sql"))),
  section("timesheets backend", "20260423_timesheets_backend.sql", stripTransactions(read("20260423_timesheets_backend.sql"))),
  section("documents soft-hide", "20260424_documents_user_soft_hide.sql", stripTransactions(read("20260424_documents_user_soft_hide.sql"))),
  section("staff_performance_reviews", "20260425_staff_performance_reviews.sql", stripTransactions(read("20260425_staff_performance_reviews.sql"))),
  section("session_feedback lead select all", "20260426_session_feedback_lead_select_all.sql", stripTransactions(read("20260426_session_feedback_lead_select_all.sql"))),
  section("leader term + observation reports", "20260427_leader_term_reviews_and_staff_observation_reports.sql", stripTransactions(read("20260427_leader_term_reviews_and_staff_observation_reports.sql"))),
  section("schedule_overrides foundation", "20260429_schedule_overrides_foundation.sql", stripTransactions(read("20260429_schedule_overrides_foundation.sql"))),
  section("hr_records", "20260607220000_hr_records.sql", stripTransactions(read("20260607220000_hr_records.sql"))),
  section("hr_records.active", "20260607230000_hr_records_active.sql", stripTransactions(read("20260607230000_hr_records_active.sql"))),
  section("client_payments", "20260607240000_client_payments.sql", stripTransactions(read("20260607240000_client_payments.sql"))),
  "\ncommit;\n",
];

const consolidated = parts.join("\n");
fs.writeFileSync(OUT, consolidated);

const contractType = `-- payroll contract_type column (schema only; no prod seed UPDATEs).
-- Source: database/migrations/20260607200000_payroll_contract_attributes.sql (ALTER only)
-- Runs after 20260607130000_payroll_timesheet_imports.sql

begin;

alter table public.staff_timesheet_imports
  add column if not exists contract_type text;

commit;
`;

fs.writeFileSync(CONTRACT_TYPE_OUT, contractType);

console.log("Wrote", OUT, `${(consolidated.length / 1024).toFixed(1)}KB`);
console.log("Wrote", CONTRACT_TYPE_OUT);
