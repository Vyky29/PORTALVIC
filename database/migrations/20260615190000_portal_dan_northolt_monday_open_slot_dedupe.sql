-- Dan Monday Northolt 4.30–5: remove duplicate portal_roster_rows open slots.
-- Bundle already has NO PARTICIPANT 4.30 to 5; dated "No client" rows with "4:30 to 5"
-- duplicated the slot and parsed as phantom 4–5 in the staff dashboard.

delete from public.portal_roster_rows
where status = 'active'
  and lower(trim(venue)) = 'northolt'
  and lower(trim(instructors)) = 'dan'
  and lower(trim(day)) = 'monday'
  and lower(trim(client_name)) in ('no client', 'no participant', 'noclient', 'no_client')
  and session_date is not null;

update public.portal_roster_rows
set time_slot = replace(replace(trim(time_slot), ':30', '.30'), ':15', '.15'),
    updated_at = now()
where status = 'active'
  and time_slot ~ ':[0-9]';
