-- Elia demo parent inbox: real mailbox (old demo address did not exist).

begin;

update public.portal_parent_contacts
set email = 'victor@clubsensational.org'
where contact_id = 'elia-matilla-demo'
   or parent_person_id = 'parent-victor-matilla-demo';

commit;
