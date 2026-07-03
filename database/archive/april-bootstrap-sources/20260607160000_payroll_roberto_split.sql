-- Roberto Reali: split his payslip into the two things the report shows separately.
--   * Base contract salary (£2,166.67/mo = £26,000/yr) -> pay_type 'contract'
--     (appears in "Contract / invoice - paid separately", no penalty, not a timesheet).
--   * Extra hours -> pay_type 'timesheet' so they are counted with the other workers
--     in the timesheet total (no penalty). Only the months he actually did extras.
-- Two rows can coexist in the same month because the unique key is (period_month, name_key)
-- and the extra-hours row uses a distinct name. Re-runnable (upsert).

begin;

insert into public.staff_timesheet_imports (user_id, period_month, name, role, pay_type, gross, note)
select
  (
    select sp.id from public.staff_profiles sp
    where lower(sp.username) = 'roberto' or lower(sp.full_name) = 'roberto reali'
    order by (lower(sp.username) = 'roberto') desc
    limit 1
  ) as user_id,
  v.period_month::date, v.name, v.role, v.pay_type, v.gross::numeric, v.note
from (values
  -- Base contract salary (separate section)
  ('2026-01-01', 'Roberto Reali', 'Contract - base salary', 'contract', 2166.67, 'Base GBP 26,000/yr'),
  ('2026-02-01', 'Roberto Reali', 'Contract - base salary', 'contract', 2166.67, 'Base GBP 26,000/yr'),
  ('2026-03-01', 'Roberto Reali', 'Contract - base salary', 'contract', 2166.67, 'Base GBP 26,000/yr'),
  ('2026-04-01', 'Roberto Reali', 'Contract - base salary', 'contract', 2166.67, 'Base GBP 26,000/yr'),
  ('2026-05-01', 'Roberto Reali', 'Contract - base salary', 'contract', 2166.67, 'Base GBP 26,000/yr'),
  -- Extra hours (timesheet section, counted like the other workers)
  ('2026-02-01', 'Roberto Reali (extra hours)', 'Extra hours', 'timesheet', 40.00,  'Extra hours Feb'),
  ('2026-03-01', 'Roberto Reali (extra hours)', 'Extra hours', 'timesheet', 186.00, 'Extra hours Mar'),
  ('2026-04-01', 'Roberto Reali (extra hours)', 'Extra hours', 'timesheet', 108.00, 'Extra hours Apr')
) as v(period_month, name, role, pay_type, gross, note)
on conflict (period_month, name_key) do update
  set gross = excluded.gross,
      pay_type = excluded.pay_type,
      role = excluded.role,
      user_id = excluded.user_id,
      name = excluded.name,
      note = excluded.note;

commit;
