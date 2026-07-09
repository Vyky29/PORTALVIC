-- Fill parent-contact gaps ahead of the WhatsApp contact-number email.
--
-- 1) Add missing mobiles (+ parent name/address where provided) to 5 existing
--    in-class families that had no mobile on file.
-- 2) Consolidate the mislabelled "Sam sam Abdi" contact: Sam sam Abdi is the
--    MOTHER; the child is Emani (same registration/email samimdee@hotmail.co.uk).
-- 3) Insert new in-class families that were attending sessions but had no
--    contact on file: Logan, Karo (sibling of Kareena / Chopi), Jad, Saaib,
--    Yamik, and Tinashe (Nekati family + Liberty Social Work Services — 3 emails).
--
-- Trials (Chaitanya, Jordan one-off, Tevlon) are intentionally NOT added.
-- Karo reuses Chopi's parent_person_id (6436375) and the same email as Kareena,
-- so the family still receives a single email (send de-dups by email).

begin;

-- 1) Mobiles + details on existing rows ---------------------------------------
update public.portal_parent_contacts
  set mobile = '07538463648', updated_at = now()
where contact_id = '167';  -- Aqsa Farooq

update public.portal_parent_contacts
  set mobile = '07539340595',
      parent_display = 'Hyam Nessour', parent_first_name = 'Hyam', parent_last_name = 'Nessour',
      updated_at = now()
where contact_id = '209';  -- Faris Lobinet (mother Hyam Nessour)

update public.portal_parent_contacts
  set mobile = '07841097041',
      parent_display = 'Juliette Fenton', parent_first_name = 'Juliette', parent_last_name = 'Fenton',
      address_line1 = '6 Peony Gardens', city = 'London', postcode = 'W12 0RX',
      updated_at = now()
where contact_id = '354';  -- Adam Pilcher (mother Juliette Fenton)

update public.portal_parent_contacts
  set mobile = '07815548173',
      parent_display = 'Kelidon Mesi', parent_first_name = 'Kelidon', parent_last_name = 'Mesi',
      address_line1 = '20 Derby Road', postcode = 'UB8 2NB',
      updated_at = now()
where contact_id = '385';  -- Mia Mesi (father Kelidon Mesi)

-- 2) Sam sam Abdi (mother) → child is Emani -----------------------------------
update public.portal_parent_contacts
  set child_display = 'Emani', child_first_name = 'Emani', child_last_name = null,
      parent_display = 'Sam sam Abdi', parent_first_name = 'Sam sam', parent_last_name = 'Abdi',
      mobile = '07398232285', dob_iso = '2020-08-22'::date,
      updated_at = now()
where contact_id = '376';  -- was mislabelled child "Sam sam Abdi"

-- 3) New in-class families -----------------------------------------------------
insert into public.portal_parent_contacts
  (contact_id, parent_person_id, child_display, child_first_name, child_last_name,
   parent_display, parent_first_name, parent_last_name, email, mobile,
   address_line1, city, postcode, dob_iso, in_class, on_waiting_list)
values
  ('gap-logan-hibbitts', 'gap-shane-hibbitts', 'Logan Hibbitts', 'Logan', 'Hibbitts',
   'Shane Hibbitts', 'Shane', 'Hibbitts', 'shanehibbitts@hotmail.com', '07876528284',
   'Flat 3, Maynard Court', 'London', 'W4 5AW', '2022-08-08'::date, true, false),

  -- Karo: sibling of Kareena — reuse Chopi's family id + email (single send).
  ('gap-karo-alhassani', '6436375', 'Karo', 'Karo', null,
   'Chopi Al hassani', 'Chopi', 'Al hassani', 'kwranichopi@yahoo.co.uk', '07982615603',
   '109b Twyford Avenue', 'London', 'W3 9QG', '2016-05-09'::date, true, false),

  ('gap-jad-zerti', 'gap-salem-zerti', 'Jad Zerti', 'Jad', 'Zerti',
   'Salem Zerti', 'Salem', 'Zerti', 'salem@zerti.co.uk', '07789584222',
   '16 Woodfield Ave', 'London', 'W5 1PA', '2005-08-23'::date, true, false),

  ('gap-saaib-abdullah', 'gap-shahanara-begum', 'Saaib Abdullah', 'Saaib', 'Abdullah',
   'Shahanara Begum', 'Shahanara', 'Begum', 'pobox10@msn.com', '07886890767',
   '18 Ravenscourt Square', 'London', 'W6 0TW', '2019-08-18'::date, true, false),

  ('gap-yamik-limbu', 'gap-bhawana-limbu', 'Yamik Limbu', 'Yamik', 'Limbu',
   'Bhawana Limbu', 'Bhawana', 'Limbu', 'limbubhawana481@gmail.com', '07476608860',
   '53 Islip Manor Road', 'London', 'UB5 5EA', '2018-10-14'::date, true, false),

  -- Tinashe (LA — Liberty Social Work Services). Three carer/agency inboxes,
  -- one family id. No mobile on file → email only.
  ('gap-tinashe-icloud', 'gap-tinashe-nekati', 'Tinashe', 'Tinashe', null,
   'Nekati family', null, 'Nekati', 'patnekati@icloud.com', null,
   null, null, null, null, true, false),
  ('gap-tinashe-gmail', 'gap-tinashe-nekati', 'Tinashe', 'Tinashe', null,
   'Nekati family', null, 'Nekati', 'sboe.nekati@gmail.com', null,
   null, null, null, null, true, false),
  ('gap-tinashe-agency', 'gap-tinashe-nekati', 'Tinashe', 'Tinashe', null,
   'Liberty Social Work Services', null, null, 'enquiries@libertysocialworkservices.com', null,
   null, null, null, null, true, false)
on conflict (contact_id) do update set
  parent_person_id = excluded.parent_person_id,
  child_display = excluded.child_display,
  child_first_name = excluded.child_first_name,
  child_last_name = excluded.child_last_name,
  parent_display = excluded.parent_display,
  parent_first_name = excluded.parent_first_name,
  parent_last_name = excluded.parent_last_name,
  email = excluded.email,
  mobile = excluded.mobile,
  address_line1 = excluded.address_line1,
  city = excluded.city,
  postcode = excluded.postcode,
  dob_iso = excluded.dob_iso,
  in_class = excluded.in_class,
  on_waiting_list = excluded.on_waiting_list,
  updated_at = now();

commit;
