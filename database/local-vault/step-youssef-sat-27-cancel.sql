-- Youssef · Sat 2026-06-27 · Acton Teaching Pool
-- Cancel Emani, Matthias, Saaib — sessions cancelled at end of day; instructor did not work.
-- Sunday 2026-06-28 (SwimFarm) is untouched — Youssef still owes feedback there.
-- Run: npx supabase db query --linked -f database/local-vault/step-youssef-sat-27-cancel.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

create temp table _youssef on commit drop as
select id, full_name
from public.staff_profiles
where id = 'de59ac92-8ff0-44e4-94c6-884ca161dd73'::uuid
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- ---------------------------------------------------------------------------
-- 1. Admin-style slot clears (schedule + staff Today)
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
  'youssef',
  v.anchor_start::time,
  v.anchor_end::time,
  'Acton',
  v.anchor_client_id,
  v.anchor_time_slot_label,
  'slot_clear_client',
  jsonb_build_object(
    'cancelled_by_admin', true,
    'term_roster_edit', true,
    'client_name', v.client_name
  ),
  'Sessions cancelled Sat 27 Jun — instructor did not work',
  'active',
  'ops:2026-06-28-youssef-sat-27-cancel',
  (select id from _portal_actor),
  (select id from _portal_actor)
from (
  values
    ('2026-06-27', 'emani', 'Emani', '10:30:00', '11:00:00', '10.30 to 11', '2026-06-27|emani|aquatic'),
    ('2026-06-27', 'matthias', 'Matthias', '11:00:00', '12:00:00', '11 to 12', '2026-06-27|matthias|aquatic'),
    ('2026-06-27', 'saaib', 'Saaib', '12:00:00', '12:30:00', '12 to 12.30', '2026-06-27|saaib|aquatic')
) as v(session_date, anchor_client_id, client_name, anchor_start, anchor_end, anchor_time_slot_label, portal_session_key)
where exists (select 1 from _portal_actor)
  and not exists (
    select 1
    from public.schedule_overrides so
    where so.status = 'active'
      and so.override_type = 'slot_clear_client'
      and so.session_date = v.session_date::date
      and lower(trim(so.anchor_staff_id)) = 'youssef'
      and lower(trim(so.anchor_client_id)) = lower(trim(v.anchor_client_id))
      and so.anchor_start = v.anchor_start::time
      and so.anchor_end = v.anchor_end::time
  );

-- ---------------------------------------------------------------------------
-- 2. cancellation_reports — clears feedback obligation for Youssef on sync
-- ---------------------------------------------------------------------------
insert into public.cancellation_reports (
  submitted_by_user_id,
  submitted_by_name,
  client_name,
  session_date,
  session_time,
  cancellation_timing,
  service,
  reason_category,
  notes,
  portal_session_key,
  origin
)
select
  y.id,
  y.full_name,
  v.client_name,
  v.session_date::date,
  v.anchor_time_slot_label,
  'Before the session started',
  'Aquatic Activity',
  'Other',
  'Sessions cancelled Sat 27 Jun — instructor did not work',
  v.portal_session_key,
  'term'
from (
  values
    ('2026-06-27', 'Emani', '10.30 to 11', '2026-06-27|emani|aquatic'),
    ('2026-06-27', 'Matthias', '11 to 12', '2026-06-27|matthias|aquatic'),
    ('2026-06-27', 'Saaib', '12 to 12.30', '2026-06-27|saaib|aquatic')
) as v(session_date, client_name, anchor_time_slot_label, portal_session_key)
cross join _youssef y
where exists (select 1 from _youssef)
  and not exists (
    select 1
    from public.cancellation_reports cr
    where cr.session_date = v.session_date::date
      and lower(trim(cr.client_name)) = lower(trim(v.client_name))
      and cr.submitted_by_user_id = y.id
  );

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select 'schedule_overrides' as source, session_date, anchor_client_id, anchor_time_slot_label, override_type, status
from public.schedule_overrides
where session_date = '2026-06-27'
  and lower(anchor_staff_id) = 'youssef'
  and lower(anchor_client_id) in ('emani', 'matthias', 'saaib')
order by anchor_start;

select 'cancellation_reports' as source, client_name, portal_session_key, submitted_by_name, reason_category
from public.cancellation_reports
where session_date = '2026-06-27'
  and submitted_by_user_id = 'de59ac92-8ff0-44e4-94c6-884ca161dd73'::uuid
order by client_name;
