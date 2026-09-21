-- Team of the Day (staff app) needs the same club day-off list as Sessions Overview.
-- Previously only admin/ceo or the worker themselves could SELECT staff_unavailability,
-- so leads still painted off instructors (e.g. Luliya on Tue 22).

drop policy if exists "staff_unavailability_authenticated_select" on public.staff_unavailability;
create policy "staff_unavailability_authenticated_select"
on public.staff_unavailability
for select
to authenticated
using (true);
