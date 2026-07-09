-- Parent-visible client invoices (office PDF shared to family hub).

begin;

create table if not exists public.portal_parent_invoice_share (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null references public.documents (id) on delete cascade,
  contact_id            text not null,
  invoice_number        text null,
  amount_gbp            numeric(12, 2) null,
  due_date              date null,
  payment_status        text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'partial', 'void')),
  share_status          text not null default 'hidden'
    check (share_status in ('ready', 'hidden')),
  ready_at              timestamptz null,
  ready_by              text null,
  notes                 text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (document_id)
);

create index if not exists portal_parent_invoice_share_contact_idx
  on public.portal_parent_invoice_share (contact_id, share_status, due_date desc nulls last);

create index if not exists portal_parent_invoice_share_status_idx
  on public.portal_parent_invoice_share (share_status, payment_status, updated_at desc);

comment on table public.portal_parent_invoice_share is
  'Client invoice PDFs approved for the family portal (documents.document_type = client_invoice). Phase 1: view/download only; Stripe pay later.';

alter table public.portal_parent_invoice_share enable row level security;
revoke all on public.portal_parent_invoice_share from public, anon, authenticated;
grant select, insert, update, delete on public.portal_parent_invoice_share to service_role;

-- Admin/CEO may insert client_invoice rows into documents (service role also used by Edge Functions).
drop policy if exists documents_insert_admin_client_invoice on public.documents;
create policy documents_insert_admin_client_invoice
on public.documents
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
  )
  and lower(category) = 'billing'
  and lower(document_type) = 'client_invoice'
  and source_page = 'admin_parent_invoices'
);

drop policy if exists documents_storage_insert_admin_client_invoice on storage.objects;
create policy documents_storage_insert_admin_client_invoice
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'billing'
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
  )
);

commit;
