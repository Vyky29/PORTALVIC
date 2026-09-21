-- Sun 13 Sep 2026: Berta OFF — Raul covers Hub Lead Multi book.
-- 11.45-12.30 Hub swap: Gabriel (absent) → Raul; Arthur Ma → Godsway.
-- Run: npx supabase db query --linked -f database/local-vault/office-sun13-berta-off-raul-cover-hub-swap-20260913.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

-- Keep Berta day off; reason now names Raul as cover
insert into public.staff_unavailability (name_key, staff_name, staff_id, off_date, reason)
select
  'berta',
  coalesce(sp.full_name, 'Berta Trapero'),
  sp.id,
  '2026-09-13'::date,
  'Time off requested — Raul covers Hub Lead Multi; 11.45 Gabriel↔Arthur Ma swap with Godsway'
from public.staff_profiles sp
where lower(trim(sp.username)) = 'berta'
   or lower(trim(sp.full_name)) like 'berta%'
order by case when lower(trim(sp.username)) = 'berta' then 0 else 1 end
limit 1
on conflict (name_key, off_date)
do update set
  reason = excluded.reason,
  staff_id = excluded.staff_id,
  staff_name = excluded.staff_name;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Drop COVER NEEDED on Berta Hub book (Raul is named cover)
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Cancelled — Raul named cover for Berta Hub Lead Sun 13',
  spreadsheet_revision = 'office:sun13-berta-off-raul-cover-hub-swap-20260913',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-13'
  and override_type = 'instructor_cover_needed'
  and lower(anchor_staff_id) = 'berta'
  and status = 'active';

-- Cancel prior reassigns we are about to rewrite
update public.schedule_overrides
set
  status = 'cancelled',
  reason = 'Superseded — Sun 13 Berta→Raul + 11.45 Hub swap',
  spreadsheet_revision = 'office:sun13-berta-off-raul-cover-hub-swap-20260913',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-13'
  and override_type = 'instructor_reassign'
  and status = 'active'
  and (
    (lower(anchor_staff_id) = 'berta'
      and lower(anchor_client_id) in ('jack w', 'adam ab', 'cyrus', 'arthur ma', 'erik', 'aydaan ah'))
    or (lower(anchor_staff_id) = 'godsway'
      and lower(anchor_client_id) = 'gabriel'
      and anchor_start = '11:45:00')
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
    'covering_staff_id', v.cover_id,
    'covering_staff_name', v.cover_name,
    'portal_session_key', v.portal_session_key,
    'service', 'Multi-Activity',
    'activity', 'Multi-Activity',
    'area', 'Hub Room',
    'absent_staff_id', v.absent_id
  ),
  v.reason,
  'active',
  'office:sun13-berta-off-raul-cover-hub-swap-20260913',
  a.id,
  a.id
from _portal_actor a
cross join (
  values
    -- Raul covers Berta book (except 11.45 Arthur Ma → Godsway)
    (
      '2026-09-13', 'berta', '09:30:00', '10:15:00', 'SwimFarm', 'jack w', '9.30 to 10.15',
      'raul', 'Raul', 'berta', '2026-09-13|09:30|jack w',
      'Raul covers Berta — Jack W Hub 9.30–10.15 2026-09-13'
    ),
    (
      '2026-09-13', 'berta', '10:15:00', '11:00:00', 'SwimFarm', 'adam ab', '10.15 to 11',
      'raul', 'Raul', 'berta', '2026-09-13|10:15|adam ab',
      'Raul covers Berta — Adam Ab Hub 10.15–11 2026-09-13'
    ),
    (
      '2026-09-13', 'berta', '11:00:00', '11:45:00', 'SwimFarm', 'cyrus', '11 to 11.45',
      'raul', 'Raul', 'berta', '2026-09-13|11:00|cyrus',
      'Raul covers Berta — Cyrus Hub 11–11.45 2026-09-13'
    ),
    (
      '2026-09-13', 'berta', '12:30:00', '13:15:00', 'SwimFarm', 'erik', '12.30 to 1.15',
      'raul', 'Raul', 'berta', '2026-09-13|12:30|erik',
      'Raul covers Berta — Erik Hub 12.30–1.15 2026-09-13'
    ),
    (
      '2026-09-13', 'berta', '13:15:00', '14:00:00', 'SwimFarm', 'aydaan ah', '1.15 to 2',
      'raul', 'Raul', 'berta', '2026-09-13|13:15|aydaan ah',
      'Raul covers Berta — Aydaan Ah Hub 1.15–2 2026-09-13'
    ),
    -- 11.45 swap: Arthur Ma (Berta book) → Godsway
    (
      '2026-09-13', 'berta', '11:45:00', '12:30:00', 'SwimFarm', 'arthur ma', '11.45 to 12.30',
      'godsway', 'Godsway', 'berta', '2026-09-13|11:45|arthur ma',
      'Change instructor — Arthur Ma Hub 11.45 to Godsway (swap with Gabriel) 2026-09-13'
    ),
    -- 11.45 swap: Gabriel (Godsway book, absent) → Raul
    (
      '2026-09-13', 'godsway', '11:45:00', '12:30:00', 'SwimFarm', 'gabriel', '11.45 to 12.30',
      'raul', 'Raul', 'godsway', '2026-09-13|11:45|gabriel',
      'Change instructor — Gabriel Hub 11.45 to Raul (swap with Arthur Ma; Gabriel absent) 2026-09-13'
    )
) as v(
  session_date,
  anchor_staff_id,
  anchor_start,
  anchor_end,
  anchor_venue,
  anchor_client_id,
  anchor_time_slot_label,
  cover_id,
  cover_name,
  absent_id,
  portal_session_key,
  reason
);

-- Gabriel absence follows him onto Raul's 11.45 Hub seat
update public.schedule_overrides
set
  anchor_staff_id = 'raul',
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'portal_session_key', '2026-09-13|11:45|gabriel',
    'feedback_resolution', 'absent'
  ),
  reason = coalesce(reason, 'Gabriel absent — follows to Raul Hub 11.45 after swap'),
  spreadsheet_revision = 'office:sun13-berta-off-raul-cover-hub-swap-20260913',
  updated_by = (select id from _portal_actor),
  updated_at = now()
where session_date = '2026-09-13'
  and override_type = 'client_absence_announced'
  and status = 'active'
  and lower(anchor_staff_id) = 'godsway'
  and lower(anchor_client_id) = 'gabriel'
  and anchor_start = '11:45:00';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select
  so.override_type,
  so.anchor_staff_id,
  so.anchor_client_id,
  so.anchor_time_slot_label,
  so.payload->>'covering_staff_id' as cover,
  so.status
from public.schedule_overrides so
where so.session_date = '2026-09-13'
  and so.status = 'active'
  and (
    lower(so.anchor_staff_id) in ('berta', 'raul', 'godsway')
    or lower(so.anchor_client_id) in ('gabriel', 'arthur ma', 'arthur_ma')
  )
order by so.override_type, so.anchor_start, so.anchor_staff_id;

select name_key, off_date::text, reason
from public.staff_unavailability
where name_key = 'berta' and off_date = '2026-09-13';
