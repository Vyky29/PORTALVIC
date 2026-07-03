-- Documents system: table + RLS + storage bucket/policies

create extension if not exists "uuid-ossp";

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  document_type text not null,
  category text not null,
  title text not null,
  created_at timestamptz not null default now(),
  related_date date null,
  related_client text null,
  related_session_key text null,
  file_url text not null,
  source_page text not null
);

alter table public.documents enable row level security;

grant select, insert on table public.documents to authenticated;
revoke all on table public.documents from anon;

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own
on public.documents
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
for insert
to authenticated
with check (user_id = auth.uid());

-- Optional hardening: do not allow updates/deletes from client role
revoke update, delete on table public.documents from authenticated;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists documents_storage_select_own on storage.objects;
create policy documents_storage_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_insert_own on storage.objects;
create policy documents_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_update_own on storage.objects;
create policy documents_storage_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_storage_delete_own on storage.objects;
create policy documents_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
