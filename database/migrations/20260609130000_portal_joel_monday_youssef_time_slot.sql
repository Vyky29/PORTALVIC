-- Joel Monday 5–5:30 Youssef: normalize portal_roster_rows time_slot to bundle label
-- so cancelled Joel + No client templates match staff roster merge keys.

begin;

update public.portal_roster_rows
set time_slot = '5 to 5.30', updated_at = now()
where lower(trim(day)) = 'monday'
  and lower(trim(instructors)) like '%youssef%'
  and lower(trim(client_name)) in ('joel', 'no client')
  and lower(
    replace(replace(replace(trim(time_slot), '-', ' to '), '.', ':'), '  ', ' ')
  ) = '5 to 5:30';

update public.portal_roster_rows
set time_slot = '5 to 5.30', updated_at = now()
where lower(trim(client_name)) = 'anas'
  and lower(trim(day)) = 'monday'
  and lower(trim(instructors)) like '%youssef%'
  and session_date is not null
  and lower(
    replace(replace(replace(trim(time_slot), '-', ' to '), '.', ':'), '  ', ' ')
  ) = '5 to 5:30';

commit;
