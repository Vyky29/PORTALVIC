-- Backfill of 2025 monthly pay figures (from the amounts sent to the accountant).
-- Same model as the 2026 import: timesheet workers vs contract/invoice people.
-- Roberto is split: base salary -> contract, extra hours -> timesheet.
-- Names with no account (Martin, Paloma, Polly) keep user_id null. Re-runnable:
-- the four months are wiped first so re-labels / re-runs land cleanly.
--
-- PENDING (not loaded here, waiting on figures): Sevitha Sep/Dec, Michelle Sep.

begin;

delete from public.staff_timesheet_imports
where period_month in ('2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01');

insert into public.staff_timesheet_imports (user_id, period_month, name, role, pay_type, gross)
select
  (
    select sp.id from public.staff_profiles sp
    where lower(sp.username) = v.key or lower(sp.full_name) = lower(v.name)
    order by (lower(sp.username) = v.key) desc
    limit 1
  ) as user_id,
  v.period_month::date, v.name, v.role, v.pay_type, v.gross::numeric
from (values
  -- ===== September 2025 ===== (Roberto from his payslip: base partial + extra 540)
  ('2025-09-01', 'john',     'John Kyei-Fram',       null,                          'timesheet', 810.00),
  ('2025-09-01', 'javier',   'Javier Marquez',       null,                          'timesheet', 1064.00),
  ('2025-09-01', 'giuseppe', 'Giuseppe Morelli',     null,                          'timesheet', 620.00),
  ('2025-09-01', 'bismark',  'Bismark Gyan',         null,                          'timesheet', 819.00),
  ('2025-09-01', 'paloma',   'Paloma',               null,                          'timesheet', 483.00),
  ('2025-09-01', 'polly',    'Polly',                null,                          'timesheet', 144.00),
  ('2025-09-01', 'dan',      'Dan Clarke',           null,                          'timesheet', 896.00),
  ('2025-09-01', 'andres',   'Andres Borrego',       null,                          'timesheet', 678.00),
  ('2025-09-01', 'roberto',  'Roberto Reali (extra hours)', 'Extra hours',          'timesheet', 540.00),
  ('2025-09-01', 'roberto',  'Roberto Reali',        'Contract - base salary (partial)', 'contract', 416.44),
  ('2025-09-01', 'victor',   'Victor',               'Director',                    'contract',  4167.00),
  ('2025-09-01', 'raul',     'Raul',                 'Director',                    'contract',  4167.00),
  -- ===== October 2025 =====
  ('2025-10-01', 'alex',     'Alex Stone',           null,                          'timesheet', 588.00),
  ('2025-10-01', 'andres',   'Andres Borrego',       null,                          'timesheet', 934.00),
  ('2025-10-01', 'angel',    'Angel Falceto',        null,                          'timesheet', 714.00),
  ('2025-10-01', 'berta',    'Berta Trapero Casado', null,                          'timesheet', 570.00),
  ('2025-10-01', 'bismark',  'Bismark Gyan',         null,                          'timesheet', 1162.00),
  ('2025-10-01', 'aurora',   'Aurora Garcia',        null,                          'timesheet', 1008.00),
  ('2025-10-01', 'dan',      'Dan Clarke',           null,                          'timesheet', 958.00),
  ('2025-10-01', 'javier',   'Javier Marquez',       null,                          'timesheet', 1288.00),
  ('2025-10-01', 'martin',   'Martin',               null,                          'timesheet', 240.00),
  ('2025-10-01', 'polly',    'Polly',                null,                          'timesheet', 192.00),
  ('2025-10-01', 'sandra',   'Sandra Bartolome',     null,                          'timesheet', 237.00),
  ('2025-10-01', 'giuseppe', 'Giuseppe Morelli',     null,                          'timesheet', 540.00),
  ('2025-10-01', 'john',     'John Kyei-Fram',       null,                          'timesheet', 1110.00),
  ('2025-10-01', 'paloma',   'Paloma',               null,                          'timesheet', 644.00),
  ('2025-10-01', 'roberto',  'Roberto Reali (extra hours)', 'Extra hours',          'timesheet', 368.00),
  ('2025-10-01', 'roberto',  'Roberto Reali',        'Contract - base salary',      'contract',  1583.33),
  ('2025-10-01', 'sevitha',  'Sevitha',              'Self-employed (invoice)',     'contract',  2458.33),
  ('2025-10-01', 'raul',     'Raul',                 'Director',                    'contract',  4167.00),
  ('2025-10-01', 'victor',   'Victor',               'Director',                    'contract',  1000.00),
  -- ===== November 2025 =====
  ('2025-11-01', 'alex',     'Alex Stone',           null,                          'timesheet', 308.00),
  ('2025-11-01', 'andres',   'Andres Borrego',       null,                          'timesheet', 694.00),
  ('2025-11-01', 'angel',    'Angel Falceto',        null,                          'timesheet', 658.00),
  ('2025-11-01', 'berta',    'Berta Trapero Casado', null,                          'timesheet', 3510.00),
  ('2025-11-01', 'bismark',  'Bismark Gyan',         null,                          'timesheet', 785.00),
  ('2025-11-01', 'aurora',   'Aurora Garcia',        null,                          'timesheet', 504.00),
  ('2025-11-01', 'dan',      'Dan Clarke',           null,                          'timesheet', 616.00),
  ('2025-11-01', 'javier',   'Javier Marquez',       null,                          'timesheet', 5592.00),
  ('2025-11-01', 'martin',   'Martin',               null,                          'timesheet', 480.00),
  ('2025-11-01', 'sandra',   'Sandra Bartolome',     null,                          'timesheet', 224.00),
  ('2025-11-01', 'giuseppe', 'Giuseppe Morelli',     null,                          'timesheet', 660.00),
  ('2025-11-01', 'john',     'John Kyei-Fram',       null,                          'timesheet', 765.00),
  ('2025-11-01', 'paloma',   'Paloma',               null,                          'timesheet', 207.00),
  ('2025-11-01', 'roberto',  'Roberto Reali (extra hours)', 'Extra hours',          'timesheet', 324.00),
  ('2025-11-01', 'roberto',  'Roberto Reali',        'Contract - base salary',      'contract',  1583.33),
  ('2025-11-01', 'sevitha',  'Sevitha',              'Self-employed (invoice)',     'contract',  2458.33),
  ('2025-11-01', 'raul',     'Raul',                 'Director',                    'contract',  4167.00),
  -- ===== December 2025 ===== (Roberto extra 144 + 40 = 184, matches payslip)
  ('2025-12-01', 'alex',     'Alex Stone',           null,                          'timesheet', 336.00),
  ('2025-12-01', 'carlos',   'Carlos Herrero',       null,                          'timesheet', 360.00),
  ('2025-12-01', 'angel',    'Angel Falceto',        null,                          'timesheet', 714.00),
  ('2025-12-01', 'berta',    'Berta Trapero Casado', null,                          'timesheet', 345.00),
  ('2025-12-01', 'aurora',   'Aurora Garcia',        null,                          'timesheet', 924.00),
  ('2025-12-01', 'dan',      'Dan Clarke',           null,                          'timesheet', 728.00),
  ('2025-12-01', 'javier',   'Javier Marquez',       null,                          'timesheet', 980.00),
  ('2025-12-01', 'martin',   'Martin',               null,                          'timesheet', 660.00),
  ('2025-12-01', 'sandra',   'Sandra Bartolome',     null,                          'timesheet', 168.00),
  ('2025-12-01', 'bismark',  'Bismark Gyan',         null,                          'timesheet', 971.00),
  ('2025-12-01', 'giuseppe', 'Giuseppe Morelli',     null,                          'timesheet', 900.00),
  ('2025-12-01', 'john',     'John Kyei-Fram',       null,                          'timesheet', 930.00),
  ('2025-12-01', 'paloma',   'Paloma',               null,                          'timesheet', 414.00),
  ('2025-12-01', 'roberto',  'Roberto Reali (extra hours)', 'Extra hours',          'timesheet', 184.00),
  ('2025-12-01', 'roberto',  'Roberto Reali',        'Contract - base salary',      'contract',  1583.33),
  ('2025-12-01', 'raul',     'Raul',                 'Director',                    'contract',  4167.00),
  ('2025-12-01', 'victor',   'Victor',               'Director',                    'contract',  4167.00)
) as v(period_month, key, name, role, pay_type, gross)
on conflict (period_month, name_key) do update
  set user_id = excluded.user_id,
      role = excluded.role,
      pay_type = excluded.pay_type,
      gross = excluded.gross,
      name = excluded.name;

commit;
