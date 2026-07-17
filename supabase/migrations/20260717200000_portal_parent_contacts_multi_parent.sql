-- Allow more than one parent/carer per participant (same contact_id).
-- Login still matches first + last name + oldest linked DOB.

begin;

drop index if exists public.portal_parent_contacts_contact_id_uidx;

create unique index if not exists portal_parent_contacts_contact_parent_uidx
  on public.portal_parent_contacts (contact_id, parent_person_id);

comment on index public.portal_parent_contacts_contact_parent_uidx is
  'One row per participant ↔ parent/carer pair (co-parents share contact_id).';

-- Michael Morrissey as co-parent of Arthur Morrissey (contact 201).
insert into public.portal_parent_contacts (
  contact_id,
  parent_person_id,
  child_display,
  child_first_name,
  child_last_name,
  parent_display,
  parent_first_name,
  parent_last_name,
  email,
  mobile,
  address_line1,
  address_line2,
  city,
  postcode,
  dob_iso,
  in_class,
  on_waiting_list
)
select
  c.contact_id,
  'michael-morrissey',
  c.child_display,
  c.child_first_name,
  c.child_last_name,
  'Michael Morrissey',
  'Michael',
  'Morrissey',
  null,
  null,
  c.address_line1,
  c.address_line2,
  c.city,
  c.postcode,
  c.dob_iso,
  c.in_class,
  c.on_waiting_list
from public.portal_parent_contacts c
where c.contact_id = '201'
  and c.parent_person_id = '1338816'
on conflict (contact_id, parent_person_id) do update set
  parent_display = excluded.parent_display,
  parent_first_name = excluded.parent_first_name,
  parent_last_name = excluded.parent_last_name,
  dob_iso = excluded.dob_iso,
  in_class = excluded.in_class,
  updated_at = now();

commit;
