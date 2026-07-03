-- Sun 2026-07-05: programme lead is Berta (20260622130000 wrongly set JOHN for this date).

begin;

update public.portal_roster_rows r
set instructors = 'BERTA', updated_at = now()
where r.status = 'active'
  and r.session_date = '2026-07-05'::date
  and lower(trim(r.venue)) = 'swimfarm'
  and lower(trim(r.area)) = 'hub room'
  and (
    lower(trim(r.instructors)) = 'john'
    or upper(trim(r.instructors)) like '%JOHN%BERTA%'
    or upper(trim(r.instructors)) like '%BERTA%JOHN%'
  );

commit;
