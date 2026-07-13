-- Admin-editable client registration fields on portal_parent_contacts.

begin;

alter table public.portal_parent_contacts
  add column if not exists registration_date date;

alter table public.portal_parent_contacts
  add column if not exists funding_label text;

alter table public.portal_parent_contacts
  add column if not exists payment_method_label text;

comment on column public.portal_parent_contacts.registration_date is
  'Optional admin-edited registration / form-received date (overrides export createdDisplay when set).';
comment on column public.portal_parent_contacts.funding_label is
  'Optional admin override for funding display on participant Registration summary.';
comment on column public.portal_parent_contacts.payment_method_label is
  'Optional admin override for payment method display on participant Registration summary.';

commit;
