-- Eddie Ri (Ritzema) is trial-only — remove from term/dated roster overrides.
-- Profile stays in clients_info; assign the paid trial manually via portal when ready.
-- Slot becomes open (NO PARTICIPANT), not restored to another client.

begin;

update public.portal_roster_rows
set
  client_name = 'NO PARTICIPANT',
  updated_at = now()
where status = 'active'
  and (
    lower(trim(client_name)) = 'eddie ri'
    or lower(trim(client_name)) = 'eddie ritzema'
    or lower(trim(client_name)) like 'eddie ri (%'
    or lower(trim(client_name)) like 'eddie ritzema (%'
  );

commit;
