-- Sandra: Visual Vic planner — serine + ayaan only (staff_participant_access).
begin;

delete from public.staff_participant_access spa
using public.staff_profiles sp
where spa.staff_id = sp.id
  and sp.is_active = true
  and (
    lower(trim(coalesce(sp.username, ''))) = 'sandra'
    or lower(trim(coalesce(sp.full_name, ''))) like 'sandra %'
    or sp.id in (
      select id from auth.users where lower(email) = lower('sandra@youtimecounselling.com')
    )
  )
  and spa.participant_slug not in ('serine', 'ayaan');

insert into public.staff_participant_access (staff_id, participant_slug)
select sp.id, v.slug
from public.staff_profiles sp
cross join (
  values
    ('serine'),
    ('ayaan')
) as v(slug)
where sp.is_active = true
  and (
    lower(trim(coalesce(sp.username, ''))) = 'sandra'
    or lower(trim(coalesce(sp.full_name, ''))) like 'sandra %'
    or sp.id in (
      select id from auth.users where lower(email) = lower('sandra@youtimecounselling.com')
    )
  )
on conflict do nothing;

commit;
