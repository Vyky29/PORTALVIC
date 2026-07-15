-- Fix Kate Fordham / Maire Fordham parent portal login.
-- Kate was still on the shared LA Jordan Smith parent_person_id (5990167) with
-- Jack + Kamy, wrong DOB (2025-09-11), and sometimes the LA inbox phone/email.
-- Login needs carer first+last + oldest linked child DOB (DDMMYYYY).

begin;

update public.portal_parent_contacts
set
  parent_person_id = 'maire-fordham',
  parent_display = 'Maire Fordham',
  parent_first_name = 'Maire',
  parent_last_name = 'Fordham',
  email = 'maire.ni.reagain@gmail.com',
  mobile = '07716878189',
  address_line1 = '56 Lysia St',
  address_line2 = null,
  city = 'London',
  postcode = 'SW6 6NG',
  dob_iso = '1997-09-11'::date,
  updated_at = now()
where contact_id = '197';

update public.portal_participants
set parent_person_id = 'maire-fordham', updated_at = now()
where contact_id = '197';

update public.portal_parent_contacts
set
  parent_person_id = 'faryaneh-akhavan',
  parent_display = 'Faryaneh Akhavan',
  parent_first_name = 'Faryaneh',
  parent_last_name = 'Akhavan',
  email = 'faryaneh_akhavan@yahoo.co.uk',
  mobile = '07795181580',
  dob_iso = coalesce(
    (select p.dob_iso from public.portal_participants p where p.contact_id = '199'),
    dob_iso
  ),
  updated_at = now()
where contact_id = '199';

update public.portal_participants
set parent_person_id = 'faryaneh-akhavan', updated_at = now()
where contact_id = '199';

-- Jack under Jordan LA inbox is a duplicate of Veronica Grace (contact 170).
update public.portal_parent_contacts
set in_class = false, updated_at = now()
where contact_id = '198';

commit;
