-- Michelle programme lead: planner access (staff_participant_access + app_role lead).
begin;

update public.staff_profiles
set app_role = 'lead'
where is_active = true
  and (
    lower(trim(coalesce(username, ''))) in ('michelle')
    or lower(trim(coalesce(full_name, ''))) like 'michelle %'
    or id in (
      select id from auth.users where lower(email) = lower('michelle@youtimecounselling.com')
    )
  );

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (
  values
    ('ikram'),
    ('emmanuel')
) as v(slug)
where sp.is_active = true
  and (
    lower(trim(coalesce(sp.username, ''))) in ('michelle')
    or lower(trim(coalesce(sp.full_name, ''))) like 'michelle %'
    or sp.id in (
      select id from auth.users where lower(email) = lower('michelle@youtimecounselling.com')
    )
  )
on conflict do nothing;

commit;
