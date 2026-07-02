-- ACAT Monday block: always Aquatic Activity (Big Pool), not Day Centre.
-- Eddie Mc: roster label with surname initial (distinct from Eddie Ri trial).

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

update public.portal_roster_rows
set
  service = 'Aquatic Activity',
  area = 'Big Pool',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and lower(trim(client_name)) = 'acat'
  and lower(trim(service)) like '%day centre%';

commit;
