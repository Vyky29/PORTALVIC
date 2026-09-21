-- Aurora day-off covers for Schedule & Covers (live overrides).
-- Rule: weekday Acton Aurora book → Javi; Sunday SwimFarm pool Aurora book → Luliya.
--   Tue 2026-09-08: already written by Victor in admin (do not touch).
--   Tue 2026-09-15: Aurora → Javi (Acton Aquatic book)
--   Sun 2026-09-13 + Sun 2026-10-04: Aurora → Luliya (SwimFarm pool Aquatic + Multi)
--
-- Run: npx supabase db query --linked -f database/local-vault/office-aurora-covers-javi-luliya-202609.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel prior active covers we own for these dates/clients (idempotent re-run).
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and override_type in ('instructor_reassign', 'instructor_cover_needed')
  and lower(anchor_staff_id) = 'aurora'
  and (
    (
      session_date = '2026-09-15'
      and lower(anchor_client_id) in ('closed', 'adam_mahmmoud', 'junaid_f', 'junaid', 'aydaan_ah', 'anas')
    )
    or (
      session_date in ('2026-09-13', '2026-10-04')
      and lower(anchor_client_id) in (
        'simon', 'adam_ab', 'jack_w', 'arthur_ma', 'cyrus',
        'aydaan_ah', 'erik', 'zakariya', 'faris'
      )
    )
  );

insert into public.schedule_overrides (
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  override_type,
  payload,
  reason,
  status,
  superseded_by,
  spreadsheet_revision,
  created_by,
  updated_by
)
select
  v.session_date::date,
  'aurora',
  v.anchor_start::time,
  v.anchor_end::time,
  v.anchor_venue,
  v.anchor_client_id,
  v.anchor_time_slot_label,
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', v.cover_id,
    'covering_staff_name', v.cover_name,
    'portal_session_key', v.portal_session_key
  ),
  v.reason,
  'active',
  null,
  'office:aurora-covers-javi-luliya-202609',
  a.id,
  a.id
from _portal_actor a
cross join (
  values
    -- Tue 15 Sep: Javi covers Aurora Acton Aquatic (same book as Tue 8)
    (
      '2026-09-15', '16:00:00', '16:30:00', 'Acton', 'closed', '4 to 4.30',
      'javi', 'Javi', '2026-09-15|16:00|closed',
      'Javi covers Aurora — Closed Acton 4–4.30 2026-09-15'
    ),
    (
      '2026-09-15', '16:30:00', '17:00:00', 'Acton', 'adam_mahmmoud', '4.30 to 5',
      'javi', 'Javi', '2026-09-15|16:30|adam_mahmmoud',
      'Javi covers Aurora — Adam Mahmmoud Acton 4.30–5 2026-09-15'
    ),
    (
      '2026-09-15', '17:00:00', '17:30:00', 'Acton', 'junaid_f', '5 to 5.30',
      'javi', 'Javi', '2026-09-15|17:00|junaid_f',
      'Javi covers Aurora — Junaid F Acton 5–5.30 2026-09-15'
    ),
    (
      '2026-09-15', '17:30:00', '18:00:00', 'Acton', 'aydaan_ah', '5.30 to 6',
      'javi', 'Javi', '2026-09-15|17:30|aydaan_ah',
      'Javi covers Aurora — Aydaan Ah Acton 5.30–6 2026-09-15'
    ),
    (
      '2026-09-15', '18:00:00', '18:30:00', 'Acton', 'anas', '6 to 6.30',
      'javi', 'Javi', '2026-09-15|18:00|anas',
      'Javi covers Aurora — Anas Acton 6–6.30 2026-09-15'
    ),

    -- Sun 13 Sep: Luliya covers Aurora SwimFarm pool book
    (
      '2026-09-13', '09:00:00', '09:30:00', 'SwimFarm', 'simon', '9 to 9.30',
      'luliya', 'Luliya', '2026-09-13|09:00|simon',
      'Luliya covers Aurora — Simon Aquatic 9–9.30 2026-09-13'
    ),
    (
      '2026-09-13', '09:30:00', '10:15:00', 'SwimFarm', 'adam_ab', '9.30 to 10.15',
      'luliya', 'Luliya', '2026-09-13|09:30|adam_ab',
      'Luliya covers Aurora — Adam Ab Multi 9.30–10.15 2026-09-13'
    ),
    (
      '2026-09-13', '10:15:00', '11:00:00', 'SwimFarm', 'jack_w', '10.15 to 11',
      'luliya', 'Luliya', '2026-09-13|10:15|jack_w',
      'Luliya covers Aurora — Jack W Multi 10.15–11 2026-09-13'
    ),
    (
      '2026-09-13', '11:00:00', '11:45:00', 'SwimFarm', 'arthur_ma', '11 to 11.45',
      'luliya', 'Luliya', '2026-09-13|11:00|arthur_ma',
      'Luliya covers Aurora — Arthur Ma Multi 11–11.45 2026-09-13'
    ),
    (
      '2026-09-13', '11:45:00', '12:30:00', 'SwimFarm', 'cyrus', '11.45 to 12.30',
      'luliya', 'Luliya', '2026-09-13|11:45|cyrus',
      'Luliya covers Aurora — Cyrus Multi 11.45–12.30 2026-09-13'
    ),
    (
      '2026-09-13', '12:30:00', '13:15:00', 'SwimFarm', 'aydaan_ah', '12.30 to 1.15',
      'luliya', 'Luliya', '2026-09-13|12:30|aydaan_ah',
      'Luliya covers Aurora — Aydaan Ah Multi 12.30–1.15 2026-09-13'
    ),
    (
      '2026-09-13', '13:15:00', '14:00:00', 'SwimFarm', 'erik', '1.15 to 2',
      'luliya', 'Luliya', '2026-09-13|13:15|erik',
      'Luliya covers Aurora — Erik Multi 1.15–2 2026-09-13'
    ),
    (
      '2026-09-13', '14:00:00', '14:30:00', 'SwimFarm', 'zakariya', '2 to 2.30',
      'luliya', 'Luliya', '2026-09-13|14:00|zakariya',
      'Luliya covers Aurora — Zakariya Aquatic 2–2.30 2026-09-13'
    ),
    (
      '2026-09-13', '14:30:00', '15:00:00', 'SwimFarm', 'faris', '2.30 to 3',
      'luliya', 'Luliya', '2026-09-13|14:30|faris',
      'Luliya covers Aurora — Faris Aquatic 2.30–3 2026-09-13'
    ),

    -- Sun 4 Oct: Luliya covers Aurora SwimFarm pool book (same seats)
    (
      '2026-10-04', '09:00:00', '09:30:00', 'SwimFarm', 'simon', '9 to 9.30',
      'luliya', 'Luliya', '2026-10-04|09:00|simon',
      'Luliya covers Aurora — Simon Aquatic 9–9.30 2026-10-04'
    ),
    (
      '2026-10-04', '09:30:00', '10:15:00', 'SwimFarm', 'adam_ab', '9.30 to 10.15',
      'luliya', 'Luliya', '2026-10-04|09:30|adam_ab',
      'Luliya covers Aurora — Adam Ab Multi 9.30–10.15 2026-10-04'
    ),
    (
      '2026-10-04', '10:15:00', '11:00:00', 'SwimFarm', 'jack_w', '10.15 to 11',
      'luliya', 'Luliya', '2026-10-04|10:15|jack_w',
      'Luliya covers Aurora — Jack W Multi 10.15–11 2026-10-04'
    ),
    (
      '2026-10-04', '11:00:00', '11:45:00', 'SwimFarm', 'arthur_ma', '11 to 11.45',
      'luliya', 'Luliya', '2026-10-04|11:00|arthur_ma',
      'Luliya covers Aurora — Arthur Ma Multi 11–11.45 2026-10-04'
    ),
    (
      '2026-10-04', '11:45:00', '12:30:00', 'SwimFarm', 'cyrus', '11.45 to 12.30',
      'luliya', 'Luliya', '2026-10-04|11:45|cyrus',
      'Luliya covers Aurora — Cyrus Multi 11.45–12.30 2026-10-04'
    ),
    (
      '2026-10-04', '12:30:00', '13:15:00', 'SwimFarm', 'aydaan_ah', '12.30 to 1.15',
      'luliya', 'Luliya', '2026-10-04|12:30|aydaan_ah',
      'Luliya covers Aurora — Aydaan Ah Multi 12.30–1.15 2026-10-04'
    ),
    (
      '2026-10-04', '13:15:00', '14:00:00', 'SwimFarm', 'erik', '1.15 to 2',
      'luliya', 'Luliya', '2026-10-04|13:15|erik',
      'Luliya covers Aurora — Erik Multi 1.15–2 2026-10-04'
    ),
    (
      '2026-10-04', '14:00:00', '14:30:00', 'SwimFarm', 'zakariya', '2 to 2.30',
      'luliya', 'Luliya', '2026-10-04|14:00|zakariya',
      'Luliya covers Aurora — Zakariya Aquatic 2–2.30 2026-10-04'
    ),
    (
      '2026-10-04', '14:30:00', '15:00:00', 'SwimFarm', 'faris', '2.30 to 3',
      'luliya', 'Luliya', '2026-10-04|14:30|faris',
      'Luliya covers Aurora — Faris Aquatic 2.30–3 2026-10-04'
    )
) as v(
  session_date,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  cover_id,
  cover_name,
  portal_session_key,
  reason
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
