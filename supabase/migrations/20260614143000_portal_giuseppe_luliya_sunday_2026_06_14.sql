-- Sunday 2026-06-14: Giuseppe off; Luliya covers his Hub Room Multi-Activity block.

begin;

update public.portal_roster_rows
set
  instructors = 'LULIA',
  updated_at = now()
where status = 'active'
  and session_date = '2026-06-14'::date
  and lower(trim(instructors)) = 'giuseppe'
  and lower(trim(service)) = 'multi-activity'
  and coalesce(lower(trim(area)), '') = 'hub room';

commit;
