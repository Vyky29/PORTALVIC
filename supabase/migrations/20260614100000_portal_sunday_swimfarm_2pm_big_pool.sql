-- Sunday SwimFarm aquatic 2–3pm: roster area must be Big Pool, not Teaching Pool.

begin;

update public.portal_roster_rows
set area = 'Big Pool', updated_at = now()
where status = 'active'
  and lower(trim(day)) = 'sunday'
  and lower(trim(venue)) in ('swimfarm', 'swim farm')
  and lower(trim(service)) like '%aquatic%'
  and trim(time_slot) in ('2 to 2.30', '2.30 to 3')
  and lower(trim(area)) = 'teaching pool';

commit;
