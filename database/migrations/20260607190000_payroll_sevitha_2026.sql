-- Sevitha 2026 monthly invoices (self-employed; paid outside the timesheet flow).
-- Recorded as pay_type='contract' so it shows in "Contract / invoice - paid separately".
-- Re-runnable (upsert on period_month + name_key).

begin;

insert into public.staff_timesheet_imports (user_id, period_month, name, role, pay_type, gross, note)
select
  (
    select sp.id from public.staff_profiles sp
    where lower(sp.username) = 'sevitha' or lower(sp.full_name) = 'sevitha'
    order by (lower(sp.username) = 'sevitha') desc
    limit 1
  ) as user_id,
  v.period_month::date, v.name, v.role, v.pay_type, v.gross::numeric, v.note
from (values
  ('2026-01-01', 'Sevitha', 'Self-employed (invoice)', 'contract', 1435.50, 'Invoice: 94.5h @ 15 = 1417.50 + Claude code 18 (08/01-29/01)'),
  ('2026-03-01', 'Sevitha', 'Self-employed (invoice)', 'contract', 1800.00, 'Invoice: 120h @ 15 (27/02-27/03)'),
  ('2026-04-01', 'Sevitha', 'Self-employed (invoice)', 'contract', 1747.78, 'Invoice: 114.5h @ 15 = 1717.50 + Bizay leaflets 30.28')
) as v(period_month, name, role, pay_type, gross, note)
on conflict (period_month, name_key) do update
  set user_id = excluded.user_id,
      role = excluded.role,
      pay_type = excluded.pay_type,
      gross = excluded.gross,
      name = excluded.name,
      note = excluded.note;

commit;
