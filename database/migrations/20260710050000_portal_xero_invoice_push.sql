-- Xero contact link + push status for Portal family invoices.

begin;

alter table public.portal_parent_contacts
  add column if not exists xero_contact_id text null;

comment on column public.portal_parent_contacts.xero_contact_id is
  'Xero ContactID GUID when family contact was matched/created for invoice push.';

alter table public.portal_parent_invoice_share
  add column if not exists xero_push_status text null;

alter table public.portal_parent_invoice_share
  add column if not exists xero_push_error text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_parent_invoice_share_xero_push_status_check'
  ) then
    alter table public.portal_parent_invoice_share
      add constraint portal_parent_invoice_share_xero_push_status_check
      check (
        xero_push_status is null
        or xero_push_status in ('pending', 'pushed', 'failed')
      );
  end if;
end $$;

comment on column public.portal_parent_invoice_share.xero_push_status is
  'API batch push to Xero: pending/pushed/failed (null = never pushed via API).';
comment on column public.portal_parent_invoice_share.xero_push_error is
  'Last Xero push error detail when xero_push_status=failed.';

commit;
