-- Fix Registration Contact when it duplicated the child display name.
-- Sources: Clients Payments parent column, contact emails, and registration forms
-- (Adam Memy → Maysoun; Simon Yohannes → Sara Girmaye).

update public.portal_parent_contacts
set parent_display = 'Juliette Fenton',
    parent_first_name = 'Juliette',
    parent_last_name = 'Fenton',
    updated_at = now()
where contact_id = '354'
  and child_display = 'Adam Pilcher';

update public.portal_parent_contacts
set parent_display = 'Agata Ndregjoni',
    parent_first_name = 'Agata',
    parent_last_name = 'Ndregjoni',
    updated_at = now()
where contact_id = '176'
  and child_display = 'Erik Ndregjoni';

update public.portal_parent_contacts
set parent_display = 'Hyam Nessour',
    parent_first_name = 'Hyam',
    parent_last_name = 'Nessour',
    updated_at = now()
where contact_id = '209'
  and child_display = 'Faris Lobinet';

update public.portal_parent_contacts
set parent_display = 'Kelidon Mesi',
    parent_first_name = 'Kelidon',
    parent_last_name = 'Mesi',
    updated_at = now()
where contact_id = '385'
  and child_display = 'Mia Mesi';

update public.portal_parent_contacts
set parent_display = 'Bouchra Taoufiki',
    parent_first_name = 'Bouchra',
    parent_last_name = 'Taoufiki',
    updated_at = now()
where contact_id = '58'
  and child_display = 'Serine Hodroje';

update public.portal_parent_contacts
set parent_display = 'Saliha Ziani',
    parent_first_name = 'Saliha',
    parent_last_name = 'Ziani',
    updated_at = now()
where contact_id = '108'
  and child_display = 'Amir Kais';

update public.portal_parent_contacts
set parent_display = 'Zeyna Bakry',
    parent_first_name = 'Zeyna',
    parent_last_name = 'Bakry',
    updated_at = now()
where contact_id = '174'
  and child_display = 'Ayman El Bakry';

update public.portal_parent_contacts
set parent_display = 'Yalini',
    parent_first_name = 'Yalini',
    parent_last_name = null,
    updated_at = now()
where contact_id = '367'
  and child_display = 'VITHURA Pakeerathan';

update public.portal_parent_contacts
set parent_display = 'Obah Yusuf',
    parent_first_name = 'Obah',
    parent_last_name = 'Yusuf',
    updated_at = now()
where contact_id = '169'
  and child_display = 'Yaqoub Ismail';

update public.portal_parent_contacts
set parent_display = 'Maysoun',
    parent_first_name = 'Maysoun',
    parent_last_name = null,
    mobile = '+44 7491 151131',
    email = 'mayelokla@gmail.com',
    address_line1 = 'Flat 48 Cotton Avenue',
    city = 'Acton',
    postcode = 'W3 6YE',
    updated_at = now()
where contact_id = '304'
  and child_display = 'Adam Memy';

update public.portal_parent_contacts
set parent_display = 'Sara Girmaye',
    parent_first_name = 'Sara',
    parent_last_name = 'Girmaye',
    mobile = '+44 7456 594498',
    email = 'sabagi09@gmail.com',
    address_line1 = '12 Mackenzie Close',
    city = 'London',
    postcode = 'W12 7LZ',
    updated_at = now()
where contact_id = '396'
  and child_display = 'Simon Yohannes';
