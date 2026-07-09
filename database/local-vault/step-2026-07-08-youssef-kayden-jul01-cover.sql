-- Youssef covered Javier · Kayden · Wed 2026-07-01 · 6–6:30 Acton Teaching Pool.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-07-08-youssef-kayden-jul01-cover.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set
  anchor_time_slot_label = '6 to 6.30',
  payload = coalesce(payload, '{}'::jsonb)
    || jsonb_build_object(
      'covering_staff_id', 'youssef',
      'covering_staff_name', coalesce(payload->>'covering_staff_name', 'Youssef'),
      'portal_session_key', '2026-07-01|18:00|kayden'
    ),
  reason = coalesce(nullif(trim(reason), ''), 'Youssef covered Javier — Kayden 6–6:30'),
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where id = '2444c093-1c59-480c-9244-f5ce0b2dc401'
  and status = 'active'
  and exists (select 1 from _portal_actor);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select id, session_date, anchor_staff_id, anchor_client_id, anchor_time_slot_label,
       anchor_start, payload->>'covering_staff_id' as cover,
       payload->>'portal_session_key' as portal_session_key, status
from public.schedule_overrides
where id = '2444c093-1c59-480c-9244-f5ce0b2dc401';
