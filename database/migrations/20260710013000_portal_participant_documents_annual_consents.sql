-- Allow annual parent consents PDF rows alongside registration forms.

alter table public.portal_participant_documents
  drop constraint if exists portal_participant_documents_form_type_check;

alter table public.portal_participant_documents
  add constraint portal_participant_documents_form_type_check
  check (form_type in ('climbing_registration', 'client_registration', 'annual_consents'));

comment on table public.portal_participant_documents is
  'PDFs submitted by parents: registration forms and annual consents snapshots.';
