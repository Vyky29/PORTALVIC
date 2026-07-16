-- Parent portal must not surface internal invoice notes (smoke, re-enrol audit, demo copy).
-- reference_text + line_description remain the parent-facing labels.

update public.portal_parent_invoice_share
set
  notes = null,
  updated_at = now()
where notes is not null
  and trim(notes) <> ''
  and (
    notes ilike '%demo%'
    or notes ilike '%smoke%'
    or notes ilike '%test%'
    or notes ilike 'auto from re-enrolment%'
    or notes ilike 're-enrolment payment%'
    or notes ilike '%submission %'
    or notes ilike '%tide smoke%'
    or notes ilike '%cleanup%'
    or notes ilike '%probe%'
    or notes ilike '%ignore bank%'
    or notes ilike '%tap pay%'
    or notes ilike '%tap set up%'
    or notes ilike '%TAX INVOICE regenerated%'
    or notes ilike '%booking %· pay in full%'
    or notes ilike 'gocardless %:%'
  );

update public.portal_parent_invoice_share
set
  share_status = 'hidden',
  payment_status = case
    when payment_status in ('paid', 'partial', 'pending_confirmation') then payment_status
    else 'void'
  end,
  updated_at = now()
where invoice_number ~* '^(TEST|SMOKE)-';

comment on column public.portal_parent_invoice_share.notes is
  'Admin / office notes only — not shown in the family portal (use reference_text + line_description for parents).';
