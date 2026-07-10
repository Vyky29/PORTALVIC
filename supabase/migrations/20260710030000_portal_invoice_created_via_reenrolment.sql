-- Allow family invoices auto-created from re-enrolment submit.

begin;

alter table public.portal_parent_invoice_share
  drop constraint if exists portal_parent_invoice_share_created_via_check;

alter table public.portal_parent_invoice_share
  add constraint portal_parent_invoice_share_created_via_check
  check (created_via is null or created_via in ('upload', 'portal', 'reenrolment'));

comment on column public.portal_parent_invoice_share.created_via is
  'upload = PDF from Xero/office; portal = generated in admin; reenrolment = auto from re-enrolment submit.';

commit;
