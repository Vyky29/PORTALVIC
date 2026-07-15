-- ACAT participants must use real parent contacts for portal login / payments / bookings.
-- Jordan Smith (jordan.smith@lbhf.gov.uk) is ACAT centre manager only — never the billing parent.
--
-- Final map:
--   Kate Fordham (197)       -> Maire Fordham
--   Jack Walker (gap-jack-walker) -> Francesca E Walker   (roster: Jack W)
--   Jack Stratton (170)      -> Veronica Grace           (roster: Jack S)
--   Kamy Akhavan (199)       -> Faryaneh Akhavan
--
-- Remove the legacy Jordan LA duplicate Jack Stratton row (198 / parent 5990167).

begin;

-- Ensure Kate / Maire
update public.portal_parent_contacts
set
  parent_person_id = 'maire-fordham',
  parent_display = 'Maire Fordham',
  parent_first_name = 'Maire',
  parent_last_name = 'Fordham',
  email = coalesce(nullif(trim(email), ''), 'maire.ni.reagain@gmail.com'),
  mobile = coalesce(nullif(trim(mobile), ''), '07716878189'),
  dob_iso = coalesce(
    (select p.dob_iso from public.portal_participants p where p.contact_id = '197'),
    dob_iso
  ),
  updated_at = now()
where contact_id = '197';

update public.portal_participants
set parent_person_id = 'maire-fordham', in_class = true, updated_at = now()
where contact_id = '197';

-- Ensure Jack W / Francesca
update public.portal_parent_contacts
set
  parent_person_id = 'gap-francesca-walker',
  parent_display = 'Francesca E Walker',
  parent_first_name = 'Francesca',
  parent_last_name = 'Walker',
  updated_at = now()
where contact_id = 'gap-jack-walker';

update public.portal_participants
set parent_person_id = 'gap-francesca-walker', in_class = true, updated_at = now()
where contact_id = 'gap-jack-walker';

-- Ensure Jack S / Veronica (canonical Stratton row)
update public.portal_parent_contacts
set
  parent_person_id = '5517161',
  parent_display = 'Veronica Grace',
  parent_first_name = 'Veronica',
  parent_last_name = 'Grace',
  email = coalesce(nullif(trim(email), ''), 'vgrace67@gmail.com'),
  mobile = coalesce(nullif(trim(mobile), ''), '07803093911'),
  dob_iso = coalesce(
    (select p.dob_iso from public.portal_participants p where p.contact_id = '170'),
    dob_iso
  ),
  in_class = true,
  updated_at = now()
where contact_id = '170';

update public.portal_participants
set parent_person_id = '5517161', in_class = true, updated_at = now()
where contact_id = '170';

-- Ensure Kamy / Faryaneh (clear Ashchurch LA address if still present)
update public.portal_parent_contacts
set
  parent_person_id = 'faryaneh-akhavan',
  parent_display = 'Faryaneh Akhavan',
  parent_first_name = 'Faryaneh',
  parent_last_name = 'Akhavan',
  email = coalesce(nullif(trim(email), ''), 'faryaneh_akhavan@yahoo.co.uk'),
  mobile = coalesce(nullif(trim(mobile), ''), '07795181580'),
  dob_iso = coalesce(
    (select p.dob_iso from public.portal_participants p where p.contact_id = '199'),
    dob_iso
  ),
  address_line1 = case
    when lower(coalesce(address_line1, '')) like '%ashchurch%' then null
    else address_line1
  end,
  address_line2 = case
    when lower(coalesce(address_line1, '')) like '%ashchurch%'
      or lower(coalesce(address_line2, '')) like '%goldhawk%' then null
    else address_line2
  end,
  updated_at = now()
where contact_id = '199';

update public.portal_participants
set parent_person_id = 'faryaneh-akhavan', in_class = true, updated_at = now()
where contact_id = '199';

-- Drop Jordan Smith duplicate Jack Stratton (198) — not for payments/bookings/portal login
delete from public.portal_parent_contacts where contact_id = '198';
delete from public.portal_participants where contact_id = '198';

commit;
