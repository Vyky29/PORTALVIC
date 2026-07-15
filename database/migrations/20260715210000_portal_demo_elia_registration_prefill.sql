-- Demo Elia / Victor Matilla: seed parent address + a registration payload so
-- Family portal "Update registration" opens with reviewable on-file data.

begin;

update public.portal_parent_contacts
set
  address_line1 = coalesce(nullif(trim(address_line1), ''), '14 Queensmill Road'),
  city = coalesce(nullif(trim(city), ''), 'London'),
  postcode = coalesce(nullif(trim(postcode), ''), 'SW6 6NG'),
  updated_at = now()
where contact_id = 'elia-matilla-demo';

insert into public.portal_participant_documents (
  form_type,
  participant_name,
  participant_dob,
  parent_name,
  parent_email,
  parent_phone,
  pdf_storage_path,
  payload_json,
  submitted_at
)
select
  'client_registration',
  'Elia Matilla',
  '2012-10-20',
  'Victor Matilla',
  'victor.matilla.demo@clubsensational.org',
  '+447700900123',
  'seed/elia-matilla-demo-registration.json',
  jsonb_build_object(
    'relationship', 'Father',
    'parent_name', 'Victor Matilla',
    'parent_phone', '+447700900123',
    'parent_email', 'victor.matilla.demo@clubsensational.org',
    'parent_address', '14 Queensmill Road, London',
    'parent_postcode', 'SW6 6NG',
    'participant_name', 'Elia Matilla',
    'participant_dob', '2012-10-20',
    'participant_gender', 'Female',
    'participant_school', 'Queensmill School',
    'ehcp', 'Yes',
    'social_worker', 'No'
  ),
  now()
where not exists (
  select 1
  from public.portal_participant_documents d
  where d.form_type = 'client_registration'
    and d.parent_email ilike 'victor.matilla.demo@clubsensational.org'
    and d.participant_name ilike 'Elia%'
);

commit;
