-- L&D funding: editable decision letter text (admin may customise before sending).

begin;

alter table public.portal_staff_ld_funding_applications
  add column if not exists decision_letter_text text;

comment on column public.portal_staff_ld_funding_applications.decision_letter_text is
  'Custom decision email/letter body; when set, used instead of auto-generated template.';

commit;
