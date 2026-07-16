-- Parent portal uses text parent_person_id (e.g. parent-victor-matilla-demo), not auth UUID.

alter table public.portal_parent_gocardless_mandates
  alter column parent_person_id type text using parent_person_id::text;

comment on column public.portal_parent_gocardless_mandates.parent_person_id is
  'portal_parent_contacts.parent_person_id (text slug), not auth.users id.';
