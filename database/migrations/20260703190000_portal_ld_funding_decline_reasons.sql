-- L&D funding: structured decline reasons for decision letters.

begin;

alter table public.portal_staff_ld_funding_applications
  add column if not exists decline_reason_codes text[] default null,
  add column if not exists decline_reason_other text default null;

comment on column public.portal_staff_ld_funding_applications.decline_reason_codes is
  'Selected decline reason codes (multi-select) for employee letter.';
comment on column public.portal_staff_ld_funding_applications.decline_reason_other is
  'Free-text decline reason when code "other" is selected.';

commit;
