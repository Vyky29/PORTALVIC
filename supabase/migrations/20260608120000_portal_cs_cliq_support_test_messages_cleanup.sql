-- Remove CS Cliq support/meeting test messages from staff DMs.
-- Safe: only deletes bodies with the explicit routing prefixes.

begin;

delete from public.portal_staff_dm_messages
where body like '[CS Cliq Meeting request]%'
   or body like '[CS Cliq Support]%';

commit;
