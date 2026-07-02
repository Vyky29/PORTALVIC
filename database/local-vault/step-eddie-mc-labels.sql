-- Eddie Mc: rename roster rows still labelled plain "Eddie" (distinct from Eddie Ri trial).

begin;

create temp table _portal_actor on commit drop as
select sp.id
from public.staff_profiles sp
where sp.app_role in ('ceo', 'admin', 'lead')
order by case sp.app_role when 'ceo' then 0 when 'admin' then 1 else 2 end, sp.created_at
limit 1;

update public.portal_roster_rows
set
  client_name = 'Eddie Mc',
  updated_at = now(),
  updated_by = (select id from _portal_actor)
where status = 'active'
  and lower(trim(client_name)) = 'eddie';

commit;

select client_name, session_date, time_slot, service, status
from public.portal_roster_rows
where lower(trim(client_name)) in ('eddie', 'eddie mc')
order by session_date nulls first, time_slot
limit 20;
