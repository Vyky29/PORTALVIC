-- Reassign LA-inbox children to their own parents, and finalise Tinashe.
--
-- Jordan Smith (jordan.smith@lbhf.gov.uk) was an LA/council inbox covering Kamy,
-- Kate and Jack. Their real parents are now on file:
--   Kamy  -> Faryaneh Akhavan
--   Kate  -> Maire Fordham
--   Jack  -> already covered by Veronica Grace (drop the duplicate LA row)
-- so the LA inbox is removed from the send entirely.
--
-- Tinashe: all three inboxes are family. Mum owns patnekati@icloud.com and
-- enquiries@libertysocialworkservices.com (mobile 07586616540); the WhatsApp
-- number is placed on the icloud row only to avoid double-messaging the same
-- phone (send de-dups WhatsApp by phone anyway).

begin;

-- Kamy -> Faryaneh Akhavan
update public.portal_parent_contacts
  set parent_display = 'Faryaneh Akhavan', parent_first_name = 'Faryaneh', parent_last_name = 'Akhavan',
      email = 'faryaneh_akhavan@yahoo.co.uk', mobile = '07795181580',
      updated_at = now()
where contact_id = '199';  -- Kamy Akhavan

-- Kate -> Maire Fordham
update public.portal_parent_contacts
  set parent_display = 'Maire Fordham', parent_first_name = 'Maire', parent_last_name = 'Fordham',
      email = 'maire.ni.reagain@gmail.com', mobile = '07716878189',
      address_line1 = '56 Lysia St', city = 'London', postcode = 'SW6 6NG',
      dob_iso = '2025-09-11'::date,
      updated_at = now()
where contact_id = '197';  -- Kate Fordham

-- Jack under the LA inbox is a duplicate of Veronica's row -> drop from send.
update public.portal_parent_contacts
  set in_class = false, updated_at = now()
where contact_id = '198';  -- Jack Stratton (Jordan/LA duplicate)

-- Tinashe: relabel agency row as family (mum) and set mum's mobile on one row.
update public.portal_parent_contacts
  set parent_display = 'Nekati family (Pat)', mobile = '07586616540', updated_at = now()
where contact_id = 'gap-tinashe-icloud';

update public.portal_parent_contacts
  set parent_display = 'Nekati family (mum)', updated_at = now()
where contact_id = 'gap-tinashe-agency';

commit;
