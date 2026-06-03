-- Remove Teflon guide demo from live roster merge (Mari Trini, Vitin, Sam/Jordan on TEFLON, etc.).
-- Run 20260611120200 first if updates from SQL Editor failed on updated_by (auth.uid() null).
begin;

update public.portal_roster_rows
set
  status = 'cancelled',
  updated_at = now(),
  updated_by = created_by
where upper(trim(instructors)) = 'TEFLON'
   or lower(trim(client_name)) in ('mari trini', 'vitin', 'sam demo', 'jordan demo', 'alex demo');

commit;
