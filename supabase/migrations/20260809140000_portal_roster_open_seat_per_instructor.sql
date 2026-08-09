-- Allow multiple open seats (NO PARTICIPANT) at the same day/time when
-- each seat belongs to a different instructor (Services capacity / Booking Portal).
-- Previous unique key was (day, client_name, time_slot) and blocked 2nd+ opens.

begin;

drop index if exists public.portal_roster_rows_template_active_uidx;
create unique index portal_roster_rows_template_active_uidx
  on public.portal_roster_rows (
    lower(trim(day)),
    lower(trim(client_name)),
    lower(trim(time_slot)),
    lower(trim(coalesce(instructors, ''))),
    lower(trim(coalesce(venue, '')))
  )
  where session_date is null and status = 'active';

drop index if exists public.portal_roster_rows_dated_active_uidx;
create unique index portal_roster_rows_dated_active_uidx
  on public.portal_roster_rows (
    session_date,
    lower(trim(client_name)),
    lower(trim(time_slot)),
    lower(trim(coalesce(instructors, ''))),
    lower(trim(coalesce(venue, '')))
  )
  where session_date is not null and status = 'active';

commit;
