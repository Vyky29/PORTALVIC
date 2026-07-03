-- payroll contract_type column (schema only; no prod seed UPDATEs).
-- Source: database/migrations/20260607200000_payroll_contract_attributes.sql (ALTER only)
-- Runs after 20260607130000_payroll_timesheet_imports.sql

begin;

alter table public.staff_timesheet_imports
  add column if not exists contract_type text;

commit;
