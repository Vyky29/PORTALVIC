-- Mon 7 Sep 2026: Sandra OFF — Javi Palankas covers Westway Physical (Ayaan / Serine).
-- Schedule & Covers still showed Sandra as Original; Overview already remaps via canonical.
-- Run: npx supabase db query --linked -f database/local-vault/office-mon7-sandra-off-javi-cover-20260907.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select
  'sandrabartolome',
  coalesce(sp.full_name, 'Sandra Bartolome'),
  sp.id,
  '2026-09-07'::date,
  'Time off requested — Javi Palankas covers Westway Physical (Ayaan / Serine)'
from public.staff_profiles sp
where lower(trim(sp.username)) = 'sandra'
order by sp.created_at
limit 1
on conflict (name_key, off_date)
do update set
  reason = excluded.reason,
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-09-07'
  and override_type in ('instructor_reassign', 'instructor_cover_needed')
  and status = 'active'
  and lower(anchor_staff_id) in ('sandra', 'sandrabartolome')
  and lower(anchor_client_id) in ('ayaan', 'serine');

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
  v.anchor_staff_id,
  v.anchor_start::time,
  v.anchor_end::time,
  v.anchor_venue,
  v.anchor_client_id,
  v.anchor_time_slot_label,
  'instructor_reassign',
  jsonb_build_object(
    'covering_staff_id', 'javi',
    'covering_staff_name', 'Javi',
    'portal_session_key', v.portal_session_key
  ),
  v.reason,
  'active',
  null,
  'office:mon7-sandra-off-javi-cover-20260907',
  a.id,
  a.id
from _portal_actor a
cross join (
  values
    (
      '2026-09-07',
      'sandra',
      '16:00:00',
      '17:00:00',
      'Westway',
      'ayaan',
      '4 to 5',
      '2026-09-07|16:00|ayaan',
      'Javi covers Sandra — Ayaan Westway Physical 4–5 2026-09-07'
    ),
    (
      '2026-09-07',
      'sandra',
      '17:00:00',
      '18:00:00',
      'Westway',
      'serine',
      '5 to 6',
      '2026-09-07|17:00|serine',
      'Javi covers Sandra — Serine Westway Physical 5–6 2026-09-07'
    )
) as v(
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  portal_session_key,
  reason
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
