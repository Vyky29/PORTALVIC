-- Anas Ismail: pool/area note for staff tablet (Lane SE icon on session cards).
-- Editable in admin → Edit term slot → Pool / area.

begin;

update public.portal_roster_rows
set area = 'Lane (SE)', updated_at = now()
where status = 'active'
  and lower(trim(client_name)) = 'anas';

commit;
