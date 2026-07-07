-- 2026-07-08 (Wed) Fadi Day Centre 12.30-3 is Raul + Roberto (Roberto always works
-- Fadi 12.30-3). Prior full-rota step re-added only Raul; add Roberto back.
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-07-08-fadi-roberto.sql

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

update public.portal_roster_rows
set instructors = 'RAUL, ROBERTO', updated_at = now(), updated_by = (select id from _portal_actor)
where session_date = '2026-07-08'::date
  and lower(trim(client_name)) = 'fadi'
  and time_slot = '12.30 to 3'
  and status = 'active'
  and exists (select 1 from _portal_actor);

commit;

select client_name, time_slot, instructors, status
from public.portal_roster_rows
where session_date = '2026-07-08'::date and lower(trim(client_name)) = 'fadi'
order by status desc, time_slot, instructors;
