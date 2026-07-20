-- ACAT Autumn 26/27: £50 × Day Centre Monday weeks (15/12/16/43).
-- First week session: Tue 1 Sep 2026 (Mon 31 Aug bank holiday closed).

update public.client_payments
set
  amount = 750,
  payment_status = 'Outstanding',
  data = (
    coalesce(data::jsonb, '{}'::jsonb) || jsonb_build_object(
      'Sessions', 'Mon 11–12 · 15 Aut / 12 Spr / 16 Sum / 43 year (Day Centre Mondays)',
      'Cost', '£50 / session',
      'Autumn basis', '15 × £50 = £750 (first week Tue 1 Sep 2026 — Mon 31 Aug BH closed)',
      'Year billed (26/27)', '£2,150',
      'Year outstanding', '£2,150',
      'Next', 'ACAT 26/27: £750 Aut · £600 Spr · £800 Sum · £2,150 year (43×£50)'
    )
  )::json
where client_key in ('jacks', 'jackw', 'kamy', 'kate')
  and coalesce(data->>'Term', '') ilike '%autumn%';
