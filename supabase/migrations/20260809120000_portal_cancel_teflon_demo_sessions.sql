-- Keep portal-guide TEFLON demo out of live Services / Scheduling / Booking Portal.
-- Account `teflon` may remain for guide login; sessions must not pollute real rosters.
-- Idempotent: safe if rows were already cancelled.

begin;

update public.portal_roster_rows
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = coalesce(updated_by, created_by)
where status is distinct from 'cancelled'
  and (
    upper(trim(instructors)) = 'TEFLON'
    or instructors ~* '(^|[,/& ])teflon([,/& ]|$)'
  );

commit;
