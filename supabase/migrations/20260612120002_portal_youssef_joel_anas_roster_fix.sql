-- Youssef Monday 5–5.30: Joel cancelled from 2026-06-15 (Anas covers); Joel returns 2026-07-13.
-- Fix wrong schedule_overrides anchored on Anas, July-13 duplicate "No participant", and absent rows.

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- ---------------------------------------------------------------------------
-- 1. Cancelled overrides must anchor Joel (not Anas).
-- ---------------------------------------------------------------------------
update public.schedule_overrides
set
  anchor_client_id = 'joel',
  reason = coalesce(nullif(trim(reason), ''), 'Term roster · Joel cancelled from slot'),
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and override_type = 'slot_clear_client'
  and coalesce((payload->>'cancelled_by_admin')::boolean, false) = true
  and lower(trim(anchor_staff_id)) = 'youssef'
  and lower(trim(anchor_venue)) = 'acton'
  and anchor_start = '17:00:00'::time
  and anchor_end = '17:30:00'::time
  and lower(trim(anchor_client_id)) = 'anas'
  and session_date >= '2026-06-15'::date
  and session_date < '2026-07-13'::date;

-- Remove erroneous clear-slot on Joel's last session (shows duplicate No participant + Joel).
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and override_type = 'slot_clear_client'
  and lower(trim(anchor_staff_id)) = 'youssef'
  and lower(trim(anchor_venue)) = 'acton'
  and anchor_start = '17:00:00'::time
  and anchor_end = '17:30:00'::time
  and session_date = '2026-07-13'::date;

-- Any active clear on Anas for the same slot/dates (wrong participant cleared).
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and override_type = 'slot_clear_client'
  and lower(trim(anchor_staff_id)) = 'youssef'
  and lower(trim(anchor_venue)) = 'acton'
  and anchor_start = '17:00:00'::time
  and anchor_end = '17:30:00'::time
  and lower(trim(anchor_client_id)) = 'anas'
  and session_date >= '2026-06-15'::date
  and session_date <= '2026-07-13'::date;

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

-- ---------------------------------------------------------------------------
-- 2. portal_roster_rows: Anas on covered Mondays; suppress Joel except last slot.
-- ---------------------------------------------------------------------------
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status
)
select
  v.client_name,
  'Monday',
  '5 to 5.30',
  'YOUSSEF',
  'Aquatic Activity',
  'Teaching Pool',
  'Acton',
  v.session_date::date,
  'active'
from (
  values
    ('Anas', '2026-06-15'),
    ('Anas', '2026-06-22'),
    ('Anas', '2026-06-29'),
    ('Anas', '2026-07-06')
) as v(client_name, session_date)
where not exists (
  select 1
  from public.portal_roster_rows r
  where r.status = 'active'
    and r.session_date = v.session_date::date
    and lower(trim(r.client_name)) = 'anas'
    and lower(trim(r.day)) = 'monday'
    and lower(trim(r.instructors)) like '%youssef%'
    and lower(replace(replace(trim(r.time_slot), '-', ' to '), '.', ':')) like '5 to 5%30%'
);

update public.portal_roster_rows
set status = 'cancelled', updated_at = now()
where status = 'active'
  and lower(trim(client_name)) = 'joel'
  and lower(trim(day)) = 'monday'
  and lower(trim(instructors)) like '%youssef%'
  and lower(replace(replace(trim(time_slot), '-', ' to '), '.', ':')) like '5 to 5%30%'
  and session_date in (
    '2026-06-15'::date,
    '2026-06-22'::date,
    '2026-06-29'::date,
    '2026-07-06'::date
  );

update public.portal_roster_rows
set status = 'cancelled', updated_at = now()
where status = 'active'
  and lower(trim(client_name)) in ('no client', 'noclient')
  and lower(trim(day)) = 'monday'
  and lower(trim(instructors)) like '%youssef%'
  and lower(replace(replace(trim(time_slot), '-', ' to '), '.', ':')) like '5 to 5%30%'
  and session_date = '2026-07-13'::date;

-- ---------------------------------------------------------------------------
-- 3. Absent announcements (Abodi P 1 Jun; Emani Sat 13 Jun — next Youssef session).
-- ---------------------------------------------------------------------------
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
  'client_absence_announced',
  '{}'::jsonb,
  v.reason,
  'active',
  'migration:20260612120000_youssef_absent',
  (select id from _portal_actor),
  (select id from _portal_actor)
from (
  values
    (
      '2026-06-01',
      'youssef',
      '17:30:00',
      '18:30:00',
      'Acton',
      'abodi_p',
      '5.30 to 6.30',
      'Participant absent — Abodi P'
    ),
    (
      '2026-06-13',
      'youssef',
      '10:30:00',
      '11:00:00',
      'Acton',
      'emani',
      '10.30 to 11',
      'Participant absent — Emani'
    )
) as v(
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  reason
)
where exists (select 1 from _portal_actor)
  and not exists (
    select 1
    from public.schedule_overrides so
    where so.status = 'active'
      and so.override_type = 'client_absence_announced'
      and so.session_date = v.session_date::date
      and lower(trim(so.anchor_staff_id)) = lower(trim(v.anchor_staff_id))
      and lower(trim(so.anchor_client_id)) = lower(trim(v.anchor_client_id))
      and so.anchor_start = v.anchor_start::time
  );

commit;
