-- Backfill of 2026 monthly pay figures (from the amounts sent to the accountant).
-- Matches each name to a staff_profiles user_id by username/full_name; names with
-- no account (e.g. Martin, ex-staff) keep user_id null and store the literal name.
-- pay_type = 'contract' for people paid outside the timesheet flow (Roberto,
-- Victor, Raul). Re-runnable (upsert on period_month + name).

begin;

insert into public.staff_timesheet_imports (user_id, period_month, name, pay_type, gross)
select
  (
    select sp.id from public.staff_profiles sp
    where lower(sp.username) = v.key or lower(sp.full_name) = lower(v.name)
    order by (lower(sp.username) = v.key) desc
    limit 1
  ) as user_id,
  v.period_month::date,
  v.name,
  v.pay_type,
  v.gross::numeric
from (values
  -- January 2026
  ('2026-01-01', 'alex',     'Alex Stone',           'timesheet', 196.00),
  ('2026-01-01', 'angel',    'Angel Falceto',        'timesheet', 238.00),
  ('2026-01-01', 'aurora',   'Aurora Garcia',        'timesheet', 392.00),
  ('2026-01-01', 'berta',    'Berta Trapero Casado', 'timesheet', 450.00),
  ('2026-01-01', 'bismark',  'Bismark Gyan',         'timesheet', 375.00),
  ('2026-01-01', 'carlos',   'Carlos Herrero',       'timesheet', 270.00),
  ('2026-01-01', 'dan',      'Dan Clarke',           'timesheet', 322.00),
  ('2026-01-01', 'giuseppe', 'Giuseppe Morelli',     'timesheet', 360.00),
  ('2026-01-01', 'javier',   'Javier Marquez',       'timesheet', 728.00),
  ('2026-01-01', 'john',     'John Kyei-Fram',       'timesheet', 345.00),
  ('2026-01-01', 'martin',   'Martin',               'timesheet', 360.00),
  ('2026-01-01', 'sandra',   'Sandra Bartolome',     'timesheet', 112.00),
  -- February 2026
  ('2026-02-01', 'alex',     'Alex Stone',           'timesheet', 360.00),
  ('2026-02-01', 'angel',    'Angel Falceto',        'timesheet', 518.00),
  ('2026-02-01', 'aurora',   'Aurora Garcia',        'timesheet', 728.00),
  ('2026-02-01', 'berta',    'Berta Trapero Casado', 'timesheet', 345.00),
  ('2026-02-01', 'bismark',  'Bismark Gyan',         'timesheet', 759.00),
  ('2026-02-01', 'dan',      'Dan Clarke',           'timesheet', 560.00),
  ('2026-02-01', 'giuseppe', 'Giuseppe Morelli',     'timesheet', 580.00),
  ('2026-02-01', 'javier',   'Javier Marquez',       'timesheet', 1148.00),
  ('2026-02-01', 'john',     'John Kyei-Fram',       'timesheet', 765.00),
  ('2026-02-01', 'martin',   'Martin',               'timesheet', 468.00),
  ('2026-02-01', 'sandra',   'Sandra Bartolome',     'timesheet', 168.00),
  ('2026-02-01', 'godsway',  'Godsway Yatofo',       'timesheet', 112.00),
  ('2026-02-01', 'roberto',  'Roberto Reali',        'contract',  40.00),
  -- March 2026
  ('2026-03-01', 'alex',     'Alex Stone',           'timesheet', 480.00),
  ('2026-03-01', 'angel',    'Angel Falceto',        'timesheet', 532.00),
  ('2026-03-01', 'aurora',   'Aurora Garcia',        'timesheet', 798.00),
  ('2026-03-01', 'berta',    'Berta Trapero Casado', 'timesheet', 570.00),
  ('2026-03-01', 'bismark',  'Bismark Gyan',         'timesheet', 1049.00),
  ('2026-03-01', 'dan',      'Dan Clarke',           'timesheet', 1134.00),
  ('2026-03-01', 'giuseppe', 'Giuseppe Morelli',     'timesheet', 820.00),
  ('2026-03-01', 'javier',   'Javier Marquez',       'timesheet', 1512.00),
  ('2026-03-01', 'john',     'John Kyei-Fram',       'timesheet', 1170.00),
  ('2026-03-01', 'sandra',   'Sandra Bartolome',     'timesheet', 224.00),
  ('2026-03-01', 'godsway',  'Godsway Yatofo',       'timesheet', 216.00),
  ('2026-03-01', 'carlos',   'Carlos Herrero',       'timesheet', 675.50),
  ('2026-03-01', 'roberto',  'Roberto Reali',        'contract',  186.00),
  -- April 2026
  ('2026-04-01', 'alex',     'Alex Stone',           'timesheet', 120.00),
  ('2026-04-01', 'dan',      'Dan Clarke',           'timesheet', 560.00),
  ('2026-04-01', 'carlos',   'Carlos Herrero',       'timesheet', 150.00),
  ('2026-04-01', 'angel',    'Angel Falceto',        'timesheet', 252.00),
  ('2026-04-01', 'godsway',  'Godsway Yatofo',       'timesheet', 72.00),
  ('2026-04-01', 'john',     'John Kyei-Fram',       'timesheet', 360.00),
  ('2026-04-01', 'bismark',  'Bismark Gyan',         'timesheet', 391.00),
  ('2026-04-01', 'sandra',   'Sandra Bartolome',     'timesheet', 56.00),
  ('2026-04-01', 'roberto',  'Roberto Reali',        'contract',  108.00),
  ('2026-04-01', 'youssef',  'Youssef Moustafa',     'timesheet', 235.00),
  ('2026-04-01', 'aurora',   'Aurora Garcia',        'timesheet', 420.00),
  ('2026-04-01', 'giuseppe', 'Giuseppe Morelli',     'timesheet', 300.00),
  ('2026-04-01', 'berta',    'Berta Trapero Casado', 'timesheet', 285.00),
  ('2026-04-01', 'javier',   'Javier Marquez',       'timesheet', 588.00),
  ('2026-04-01', 'raul',     'Raul',                 'contract',  4167.00),
  ('2026-04-01', 'victor',   'Victor',               'contract',  4167.00),
  -- May 2026
  ('2026-05-01', 'giuseppe', 'Giuseppe Morelli',     'timesheet', 800.00),
  ('2026-05-01', 'bismark',  'Bismark Gyan',         'timesheet', 1017.00),
  ('2026-05-01', 'godsway',  'Godsway Yatofo',       'timesheet', 432.00),
  ('2026-05-01', 'luliya',   'Luliya',               'timesheet', 792.00),
  ('2026-05-01', 'simon',    'Simon Griffiths',      'timesheet', 264.50),
  ('2026-05-01', 'berta',    'Berta Trapero Casado', 'timesheet', 570.00),
  ('2026-05-01', 'john',     'John Kyei-Fram',       'timesheet', 930.00),
  ('2026-05-01', 'dan',      'Dan Clarke',           'timesheet', 280.00),
  ('2026-05-01', 'carlos',   'Carlos Herrero',       'timesheet', 510.00),
  ('2026-05-01', 'javier',   'Javier Marquez',       'timesheet', 1442.00),
  ('2026-05-01', 'youssef',  'Youssef Moustafa',     'timesheet', 961.50),
  ('2026-05-01', 'angel',    'Angel Falceto',        'timesheet', 447.50),
  ('2026-05-01', 'michelle', 'Michelle',             'timesheet', 3000.00),
  ('2026-05-01', 'alex',     'Alex Stone',           'timesheet', 240.00),
  ('2026-05-01', 'aurora',   'Aurora Garcia',        'timesheet', 671.50),
  ('2026-05-01', 'sandra',   'Sandra Bartolome',     'timesheet', 168.00),
  ('2026-05-01', 'victor',   'Victor',               'contract',  4167.00),
  ('2026-05-01', 'raul',     'Raul',                 'contract',  4167.00)
) as v(period_month, key, name, pay_type, gross)
on conflict (period_month, name_key) do update
  set user_id = excluded.user_id,
      pay_type = excluded.pay_type,
      gross = excluded.gross,
      name = excluded.name;

commit;

-- Verification: any rows that did NOT match a staff account (review these).
-- select period_month, name, pay_type, gross
-- from public.staff_timesheet_imports
-- where user_id is null
-- order by period_month, name;
