-- Tinashe SwimFarm Hub Room (Wednesdays): John + Godsway + Bismark — not Giuseppe (Acton Wed sessions).

begin;

update public.portal_roster_rows
set instructors = 'JOHN, GODSWAY, BISMARK', updated_at = now()
where status = 'active'
  and lower(trim(client_name)) = 'tinashe'
  and lower(trim(day)) = 'wednesday'
  and lower(trim(venue)) in ('swimfarm', 'swim farm')
  and lower(trim(time_slot)) like '%4.30%'
  and (
    session_date is null
    or session_date >= '2026-06-01'::date
  )
  and instructors ~* 'giuseppe';

commit;
