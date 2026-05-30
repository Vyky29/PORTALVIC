-- Contract/invoice people: show their real job role + a contract type
-- (Part time / Full time / Self-employed) in the payroll report.
-- Authoritative attributes for the contract rows; run after the seed imports.
-- Re-runnable.

begin;

alter table public.staff_timesheet_imports
  add column if not exists contract_type text;

-- Roberto: real role + part-time contract (base salary row).
update public.staff_timesheet_imports
set role = 'Swimming Instructor 2 · Support Worker 2',
    contract_type = 'Part time'
where pay_type = 'contract' and name_key = 'roberto reali';

-- Victor & Raul: directors on full-time contracts.
update public.staff_timesheet_imports
set contract_type = 'Full time'
where pay_type = 'contract' and name_key in ('victor', 'raul');

-- Sevitha: self-employed (invoices).
update public.staff_timesheet_imports
set role = 'Admin',
    contract_type = 'Self-employed'
where pay_type = 'contract' and name_key = 'sevitha';

commit;
