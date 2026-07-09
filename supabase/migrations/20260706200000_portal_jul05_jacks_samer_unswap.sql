-- Sunday 2026-07-05 SwimFarm: undo the premature Samer<->Jack S swap for that day.
--
-- The static bundle applied the Samer<->Jack S swap from 07/06 onward, but the
-- multi-activity team did not action it on 05/07 and ran the usual rota:
--   * Roberto (Big Pool, 10.15-11) actually taught JACK S (not Samer).
--   * Giuseppe (Hub Room, 10.15-11) actually taught SAMER (not Jack S).
-- Samer/Roberto for 05/07 is already cancelled (previous migration). Here we:
--   1) add Jack S as an active Roberto/Big Pool slot  -> Roberto owes Jack S feedback,
--   2) cancel the bundle's Jack S/Giuseppe/Hub slot,
--   3) add Samer as an active Giuseppe/Hub slot        -> Giuseppe owes Samer feedback.
-- The real swap takes effect from 12/07, which the bundle already reflects
-- (Roberto is on Fadi Day Centre that day; Samer/Jack S sit with the Hub leads).

begin;

-- Active overrides (Jack S -> Roberto, Samer -> Giuseppe)
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue,
       v.session_date::date, 'active', au.id, au.id
from auth.users au
cross join (
  values
    ('Jack S', 'Sunday', '10.15 to 11', 'ROBERTO',  'Multi-Activity', 'Big Pool', 'SwimFarm', '2026-07-05'),
    ('Samer',  'Sunday', '10.15 to 11', 'GIUSEPPE', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
  and not exists (
    select 1 from public.portal_roster_rows r
    where r.session_date = v.session_date::date
      and lower(trim(r.client_name)) = lower(trim(v.client_name))
      and lower(trim(r.time_slot)) = lower(trim(v.time_slot))
      and lower(trim(r.instructors)) = lower(trim(v.instructors))
      and r.status = 'active'
  );

-- Cancel the bundle's phantom Jack S/Giuseppe/Hub slot for 05/07.
insert into public.portal_roster_rows (
  client_name, day, time_slot, instructors, service, area, venue, session_date, status, created_by, updated_by
)
select v.client_name, v.day, v.time_slot, v.instructors, v.service, v.area, v.venue,
       v.session_date::date, 'cancelled', au.id, au.id
from auth.users au
cross join (
  values
    ('Jack S', 'Sunday', '10.15 to 11', 'GIUSEPPE', 'Multi-Activity', 'Hub Room', 'SwimFarm', '2026-07-05')
) as v(client_name, day, time_slot, instructors, service, area, venue, session_date)
where lower(au.email) = lower('stf020@staff.import.pending')
  and not exists (
    select 1 from public.portal_roster_rows r
    where r.session_date = v.session_date::date
      and lower(trim(r.client_name)) = lower(trim(v.client_name))
      and lower(trim(r.time_slot)) = lower(trim(v.time_slot))
      and lower(trim(r.instructors)) = lower(trim(v.instructors))
      and r.status = 'cancelled'
  );

commit;
