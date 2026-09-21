-- Mon 7 Sep 2026: Raul OFF — Victor covers DC (Timi/Emanuel) + Hub Tinashe.
-- Run: npx supabase db query --linked -f database/local-vault/office-mon7-raul-off-victor-cover-20260907.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select
  'raul',
  coalesce(sp.full_name, 'Raul'),
  sp.id,
  '2026-09-07'::date,
  'Time off requested — Victor covers DC + Tinashe'
from public.staff_profiles sp
where lower(trim(sp.username)) = 'raul'
   or lower(trim(sp.full_name)) like 'raul%'
order by case when lower(trim(sp.username)) = 'raul' then 0 else 1 end
limit 1
on conflict (name_key, off_date)
do update set
  reason = excluded.reason,
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Cancel any prior active Raul instructor_reassign on this date for these clients
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where session_date = '2026-09-07'
  and override_type = 'instructor_reassign'
  and status = 'active'
  and lower(anchor_staff_id) = 'raul'
  and lower(anchor_client_id) in ('timi', 'emanuel', 'tinashe');

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
    'covering_staff_id', 'victor',
    'covering_staff_name', 'Victor',
    'portal_session_key', v.portal_session_key
  ),
  v.reason,
  'active',
  null,
  'office:mon7-raul-off-victor-cover-20260907',
  a.id,
  a.id
from _portal_actor a
cross join (
  values
    (
      '2026-09-07',
      'raul',
      '11:00:00',
      '13:00:00',
      'SwimFarm',
      'timi',
      '11 to 1',
      '2026-09-07|11:00|timi',
      'Victor covers Raul — timi 11 to 1 2026-09-07'
    ),
    (
      '2026-09-07',
      'raul',
      '13:00:00',
      '16:00:00',
      'SwimFarm',
      'emanuel',
      '1 to 4',
      '2026-09-07|13:00|emanuel',
      'Victor covers Raul — emanuel 1 to 4 2026-09-07'
    ),
    (
      '2026-09-07',
      'raul',
      '16:15:00',
      '18:15:00',
      'SwimFarm',
      'tinashe',
      '4.15 to 6.15',
      '2026-09-07|16:15|tinashe',
      'Victor covers Raul — tinashe 4.15 to 6.15 2026-09-07'
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

select
  so.id,
  so.session_date::text,
  so.anchor_staff_id,
  so.anchor_client_id,
  so.anchor_time_slot_label,
  so.payload->>'covering_staff_id' as cover,
  so.status
from public.schedule_overrides so
where so.session_date = '2026-09-07'
  and so.override_type = 'instructor_reassign'
  and so.status = 'active'
  and lower(so.anchor_staff_id) = 'raul'
order by so.anchor_start;

select name_key, off_date::text, reason
from public.staff_unavailability
where name_key = 'raul' and off_date = '2026-09-07';
