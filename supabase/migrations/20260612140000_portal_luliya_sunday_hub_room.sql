-- Luliya / Lulia Sunday 2026-06-14: Hub Room area on portal_roster_rows (staff tablet area note).

begin;

update public.portal_roster_rows
set area = 'Hub Room', updated_at = now()
where status = 'active'
  and session_date = '2026-06-14'::date
  and lower(trim(instructors)) ~ '(^|[,/&\s])lul(iya|ia)([,/&\s]|$)'
  and coalesce(lower(trim(area)), '') <> 'hub room';

commit;
