-- Alex Stone, Aurora Garcia and Sandra Bartolome are paid in MAY 2026 (not
-- carried over to June). Move their figures from June -> May and clear June so
-- they no longer appear in the June "not submitted" list.
-- Idempotent: re-runnable (upsert on period_month + name_key; delete is safe).

begin;

-- Pay them in May with their figures (the amounts previously held for June).
insert into public.staff_timesheet_imports (user_id, period_month, name, pay_type, gross)
select
  (
    select sp.id from public.staff_profiles sp
    where lower(sp.username) = v.key or lower(sp.full_name) = lower(v.name)
    order by (lower(sp.username) = v.key) desc
    limit 1
  ) as user_id,
  '2026-05-01'::date,
  v.name,
  'timesheet',
  v.gross::numeric
from (values
  ('alex',   'Alex Stone',       240.00),
  ('aurora', 'Aurora Garcia',    671.50),
  ('sandra', 'Sandra Bartolome', 168.00)
) as v(key, name, gross)
on conflict (period_month, name_key) do update
  set user_id  = excluded.user_id,
      pay_type = excluded.pay_type,
      gross    = excluded.gross,
      name     = excluded.name;

-- Remove the June 2026 carry-over rows for these three.
delete from public.staff_timesheet_imports
where period_month = '2026-06-01'
  and name_key in ('alex stone', 'aurora garcia', 'sandra bartolome');

commit;

-- Check:
-- select period_month, name, gross from public.staff_timesheet_imports
-- where name_key in ('alex stone','aurora garcia','sandra bartolome')
-- order by period_month, name;
