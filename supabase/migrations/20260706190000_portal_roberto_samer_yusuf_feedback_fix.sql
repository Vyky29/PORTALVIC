-- Roberto SwimFarm Sunday feedback fixes.
--
-- 1) Samer was wrongly left on Roberto's Big Pool slot (Sun 10.15-11) in the
--    static bundle for several dates. Roberto never taught Samer (his 10.15-11
--    is a break between Yusuf 9-10.15 and Gabriel 11-11.45); Samer's real
--    session is the Hub Room rotation (see the 2026-06-14 Lulia override).
--    Cancel the phantom Roberto/Big Pool rows so Roberto is not asked for
--    Samer feedback. Real Samer feedback rows (e.g. Giuseppe 28/06) are
--    untouched. If Samer's Hub Room slot needs an owner on these dates, add an
--    active override with the correct instructor.
--
-- 2) Yusuf Ah Sunday is now a single combined block "9 to 10.15" (Multi-Activity)
--    for Roberto — one feedback covers it. Roberto's 28/06 submission used the
--    old split time "9.30 to 10.15", so strict per-slot time matching left the
--    card pending. Re-key it to the combined 09:00 slot so it validates.

begin;

insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue,
       v.session_date::date, 'cancelled', au.id, au.id
from auth.users au
cross join (
  values
    ('Samer', 'Sunday', '10.15 to 11', 'ROBERTO', 'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-06-07'),
    ('Samer', 'Sunday', '10.15 to 11', 'ROBERTO', 'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-06-14'),
    ('Samer', 'Sunday', '10.15 to 11', 'ROBERTO', 'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-06-21'),
    ('Samer', 'Sunday', '10.15 to 11', 'ROBERTO', 'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-06-28'),
    ('Samer', 'Sunday', '10.15 to 11', 'ROBERTO', 'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-07-05')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
  and not exists (
    select 1 from public.portal_roster_rows r
    where r.session_date = v.session_date::date
      and lower(trim(r.client_name)) = lower(trim(v.client_name))
      and lower(trim(r.time_slot)) = lower(trim(v.time_slot))
      and r.status = 'cancelled'
  );

update public.session_feedback
set portal_session_key = '2026-06-28|09:00|yusuf_ah|big_pool',
    session_time = '9 to 10.15'
where session_date = '2026-06-28'
  and lower(trim(client_name)) = 'yusuf ah'
  and completed_by_name ilike '%roberto%'
  and portal_session_key = '2026-06-28|09:30|yusuf_ah|big_pool';

commit;
