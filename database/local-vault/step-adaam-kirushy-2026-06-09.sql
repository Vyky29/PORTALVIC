-- Portal ops: Adaam Ah feedback name fix + Kirushy permanent cancellation (Mon Northolt 4.30–5, Dan).
-- Run: npx supabase db query --linked -f database/local-vault/step-adaam-kirushy-2026-06-09.sql

begin;

-- 1) Adaam Monday 2026-06-08 — Dan submitted as "Aadam Ah"; roster uses "Adaam Ah".
update public.session_feedback
set client_name = 'Adaam Ah'
where session_date = '2026-06-08'
  and portal_session_key = '2026-06-08|18:00|adaam_ah'
  and lower(trim(client_name)) in ('aadam ah', 'adaam ah');

-- 2) Kirushy — cancel all remaining Monday slots (Teaching Pool, Northolt, Dan, 4.30 to 5).
with admin as (
  select id
  from public.staff_profiles
  where app_role = 'admin'
    and coalesce(is_active, true)
  order by full_name
  limit 1
),
dates as (
  select unnest(
    array[
      '2026-06-08'::date,
      '2026-06-15'::date,
      '2026-06-22'::date,
      '2026-06-29'::date,
      '2026-07-06'::date,
      '2026-07-13'::date
    ]
  ) as session_date
),
to_insert as (
  select d.session_date
  from dates d
  where not exists (
    select 1
    from public.schedule_overrides o
    where o.session_date = d.session_date
      and o.status = 'active'
      and o.override_type = 'slot_clear_client'
      and o.anchor_client_id = 'kirushy'
      and o.anchor_staff_id = 'dan'
      and o.anchor_venue = 'Northolt'
      and o.anchor_time_slot_label = '4.30 to 5'
  )
)
insert into public.schedule_overrides (
  created_by,
  updated_by,
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
  spreadsheet_revision
)
select
  admin.id,
  admin.id,
  ti.session_date,
  'dan',
  time '16:30',
  time '17:00',
  'Northolt',
  'kirushy',
  '4.30 to 5',
  'slot_clear_client',
  jsonb_build_object(
    'cancelled_by_admin', true,
    'term_roster_edit', true,
    'client_name', 'Kirushy'
  ),
  'Client left programme — sessions cancelled permanently',
  'active',
  'ops:2026-06-09-kirushy-cancel'
from to_insert ti
cross join admin;

commit;

-- Verify
select session_date, client_name, portal_session_key, completed_by_name
from public.session_feedback
where session_date = '2026-06-08'
  and portal_session_key = '2026-06-08|18:00|adaam_ah';

select session_date, override_type, status, payload->>'cancelled_by_admin' as cancelled
from public.schedule_overrides
where anchor_client_id = 'kirushy'
  and session_date >= '2026-06-08'
order by session_date;
