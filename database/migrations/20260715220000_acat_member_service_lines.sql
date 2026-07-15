-- ACAT Monday 11–12 (£50/session each): expose booked services on each member's parent portal.
-- Collective roster client stays `acat` for staff; parents use kate / kamy / jack_w / jack_s.
-- Last Summer session Mon 20 Jul 2026 (bank holiday Mon 4 May was closed — no credit ledger).

begin;

insert into public.portal_participant_service_lines as t (
  client_key,
  client_name,
  client_name_norm,
  sessions,
  services_count,
  source,
  term_label,
  range_from,
  range_to,
  validated,
  updated_at
)
values
  (
    'kate',
    'Kate',
    'kate',
    jsonb_build_array(
      jsonb_build_object(
        'service', 'Aquatic Activity',
        'day', 'Monday',
        'timeSlot', '11 to 12',
        'durationMin', 60,
        'instructor', 'ROBERTO',
        'venue', 'SwimFarm',
        'area', 'ACAT',
        'weeks', 1,
        'feeGbp', 50
      )
    ),
    1,
    'acat_member_seed',
    'Summer Term 2026',
    '2026-04-12',
    '2026-07-20',
    true,
    now()
  ),
  (
    'kamy',
    'Kamy',
    'kamy',
    jsonb_build_array(
      jsonb_build_object(
        'service', 'Aquatic Activity',
        'day', 'Monday',
        'timeSlot', '11 to 12',
        'durationMin', 60,
        'instructor', 'ROBERTO',
        'venue', 'SwimFarm',
        'area', 'ACAT',
        'weeks', 1,
        'feeGbp', 50
      )
    ),
    1,
    'acat_member_seed',
    'Summer Term 2026',
    '2026-04-12',
    '2026-07-20',
    true,
    now()
  )
on conflict (client_key) do update
set
  client_name = excluded.client_name,
  client_name_norm = excluded.client_name_norm,
  sessions = excluded.sessions,
  services_count = excluded.services_count,
  source = excluded.source,
  term_label = excluded.term_label,
  range_from = excluded.range_from,
  range_to = excluded.range_to,
  validated = excluded.validated,
  updated_at = now();

-- Keep Jack W / Jack S Monday ACAT line through 20 Jul (Sunday Multi-Activity unchanged).
update public.portal_participant_service_lines
set
  range_to = '2026-07-20',
  sessions = (
    select jsonb_agg(
      case
        when lower(coalesce(s->>'day', '')) = 'monday'
          and (
            lower(coalesce(s->>'area', '')) like '%acat%'
            or lower(coalesce(s->>'service', '')) like '%aquatic%'
            or lower(coalesce(s->>'service', '')) like '%day centre%'
          )
        then s || jsonb_build_object('feeGbp', 50, 'weeks', 1)
        else s
      end
    )
    from jsonb_array_elements(sessions) as s
  ),
  updated_at = now()
where client_key in ('jack_w', 'jack_s');

update public.portal_participant_service_lines
set
  range_to = '2026-07-20',
  sessions = jsonb_build_array(
    jsonb_build_object(
      'service', 'Aquatic Activity',
      'day', 'Monday',
      'timeSlot', '11 to 12',
      'durationMin', 60,
      'instructor', 'ROBERTO',
      'venue', 'SwimFarm',
      'area', 'ACAT',
      'weeks', 1,
      'feeGbp', 50
    )
  ),
  services_count = 1,
  updated_at = now()
where client_key = 'acat';

commit;
