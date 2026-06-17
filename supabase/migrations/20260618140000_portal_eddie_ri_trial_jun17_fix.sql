-- Eddie Ri trial Wed 17 Jun 2026 4:00–4:30 Acton (Youssef): remove mistaken admin cancel, set Teaching Pool notes.
begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

-- Mistaken slot_clear_client left overview as Cancelled; trial override stays active.
update public.schedule_overrides
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = coalesce(created_by, (select id from _portal_actor))
where id = '50194165-5ddf-43e3-b88e-3433c99236b7'
  and override_type = 'slot_clear_client'
  and session_date = '2026-06-17'::date;

-- Overview NOTES column reads override payload area / pool_note.
update public.schedule_overrides
set
  payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
    'area', 'Teaching Pool',
    'pool_note', 'Teaching Pool'
  ),
  updated_at = now(),
  updated_by = coalesce(updated_by, created_by, (select id from _portal_actor))
where id = 'bd7d70ee-7d60-456c-a07b-a96b2ef10e6b'
  and status = 'active'
  and override_type = 'client_replace_in_slot';

-- Stale cancelled roster rows from trial setup attempts (trial = open slot + override).
delete from public.portal_roster_rows
where session_date = '2026-06-17'::date
  and lower(trim(client_name)) in ('eddie ri', 'eddie ritzema')
  and status = 'cancelled';

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;
