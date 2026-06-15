-- Youssef · Mon 2026-06-15 · Acton
-- Dedupe Amir MakeUp (keep newest), one Joel clear, full-band Abodi absent on abodi_pa.
-- Run: npx supabase db query --linked -f database/local-vault/step-youssef-2026-06-15-amir-abodi-fix.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- ---------------------------------------------------------------------------
-- 1. Joel slot_clear duplicates (same 17:00–17:30 slot)
-- ---------------------------------------------------------------------------
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = '07d8c8b7-fb51-4a96-9ab8-d44ca3ab5266'
  and status = 'active';

-- ---------------------------------------------------------------------------
-- 2. Amir MakeUp — cancel duplicate active rows; keep newest (eb57e332)
-- ---------------------------------------------------------------------------
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id in (
  'a0726032-1e6f-4e3c-b987-2e8a426c24d8',
  '7888dac9-d7d6-4271-9cf4-75e9347f1c05',
  '03a357b0-f22d-4b3d-be50-b6bba88b126a'
)
  and status = 'active';

-- Normalise surviving MakeUp: open slot anchor + roster label for staff matcher.
update public.schedule_overrides
set
  anchor_client_id = 'available',
  anchor_time_slot_label = '5 to 5.30',
  reason = coalesce(nullif(trim(reason), ''), 'Amir make-up 5–5.30 (Anas cancelled)'),
  payload = jsonb_build_object(
    'replacement_client_id', 'amir',
    'replacement_client_name', 'Amir',
    'to_client_id', 'amir',
    'to_client_name', 'Amir',
    'makeup_window', '5 to 5.30',
    'open_slot_makeup', true
  ),
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = 'eb57e332-e871-4486-968d-df5d853a109c'
  and status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Abodi absent — full hour 17:30–18:30 on canonical abodi_pa
-- ---------------------------------------------------------------------------
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = 'da77e570-5dcf-4382-a924-ffaa222a83b6'
  and status = 'active';

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
  '2026-06-15'::date,
  'youssef',
  '17:30:00'::time,
  '18:30:00'::time,
  'Acton',
  'abodi_pa',
  '5.30 to 6.30',
  'client_absence_announced',
  '{}'::jsonb,
  'Participant absent — Abodi P',
  'active',
  'local-vault:step-youssef-2026-06-15-amir-abodi-fix',
  (select id from _portal_actor),
  (select id from _portal_actor)
where exists (select 1 from _portal_actor)
  and not exists (
    select 1
    from public.schedule_overrides so
    where so.status = 'active'
      and so.override_type = 'client_absence_announced'
      and so.session_date = '2026-06-15'::date
      and lower(trim(so.anchor_staff_id)) = 'youssef'
      and lower(trim(so.anchor_client_id)) in ('abodi_pa', 'abodi_p')
      and so.anchor_start = '17:30:00'::time
      and so.anchor_end = '18:30:00'::time
  );

-- Allow web push to re-fire for normalised rows if needed.
delete from public.portal_webpush_override_sent
where override_id in (
  'eb57e332-e871-4486-968d-df5d853a109c',
  'da77e570-5dcf-4382-a924-ffaa222a83b6'
);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select id, created_at, override_type, status, anchor_client_id, anchor_start, anchor_end, anchor_time_slot_label, payload, reason
from public.schedule_overrides
where session_date = '2026-06-15'
  and lower(trim(anchor_staff_id)) = 'youssef'
  and lower(trim(anchor_venue)) = 'acton'
  and status = 'active'
order by anchor_start, created_at;
