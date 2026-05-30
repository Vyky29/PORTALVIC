-- Label Victor and Raul as "Director" in the payroll report's contract section.
-- Their import rows are pay_type='contract' with name 'Victor' / 'Raul'.
-- Re-runnable.

begin;

update public.staff_timesheet_imports
set role = 'Director'
where pay_type = 'contract'
  and lower(name) in ('victor', 'raul');

commit;
