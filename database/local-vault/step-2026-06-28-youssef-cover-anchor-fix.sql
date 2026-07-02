-- Sunday 2026-06-28 · SwimFarm cover anchor fix
-- Youssef covered AURORA's 9 participants (Simon, Adam Ab, Jack W, Arthur Ma,
-- Cyrus, Aydaan Ah, Erik, Zakariya, Faris) but the instructor_reassign overrides
-- were anchored to 'dan' (who has no Sunday-28 roster), so the portal could not
-- bind them to the real roster rows and Youssef could not open them for feedback.
-- The actual dated roster shows AURORA on those slots, so repoint the anchor.
-- Luliya's overrides (anchor 'javier') already match Javier's real rows — untouched.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-06-28-youssef-cover-anchor-fix.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

alter table public.schedule_overrides disable trigger schedule_overrides_set_updated_trg;

update public.schedule_overrides
set anchor_staff_id = 'aurora',
    updated_at = now(),
    updated_by = (select id from _portal_actor)
where session_date = '2026-06-28'::date
  and override_type = 'instructor_reassign'
  and status = 'active'
  and lower(trim(anchor_staff_id)) = 'dan'
  and payload->>'covering_staff_id' = 'youssef'
  and exists (select 1 from _portal_actor);

alter table public.schedule_overrides enable trigger schedule_overrides_set_updated_trg;

commit;

select anchor_staff_id, anchor_client_id, to_char(anchor_start,'HH24:MI') as st,
       anchor_venue, payload->>'covering_staff_id' as cover, status
from public.schedule_overrides
where session_date = '2026-06-28'
  and override_type = 'instructor_reassign'
  and payload->>'covering_staff_id' = 'youssef'
order by anchor_start;
