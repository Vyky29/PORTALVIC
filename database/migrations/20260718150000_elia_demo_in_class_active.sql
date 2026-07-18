-- Keep Eliademo (demo) as an active in-class place for Family portal demos.
-- Former-client mode was blocking the full hub (menu, re-enrol, sessions, etc.).

begin;

update public.portal_parent_contacts
set in_class = true, updated_at = now()
where contact_id = 'elia-matilla-demo'
  and coalesce(in_class, false) is distinct from true;

update public.portal_participants
set in_class = true, updated_at = now()
where contact_id = 'elia-matilla-demo'
  and coalesce(in_class, false) is distinct from true;

commit;
