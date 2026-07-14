-- L&D funding letters: admin must SELECT rows they insert for another staff member
-- when using insert(...).select('id'). Without this, PostgREST returns
-- "new row violates row-level security policy for table documents".

begin;

-- Keep insert policy (idempotent recreate).
drop policy if exists documents_insert_admin_ld_funding on public.documents;
create policy documents_insert_admin_ld_funding
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and lower(document_type) = 'ld_funding_letter'
  and lower(category) = 'training'
  and source_page = 'ld-funding'
);

drop policy if exists documents_select_admin_ld_funding on public.documents;
create policy documents_select_admin_ld_funding
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and lower(document_type) = 'ld_funding_letter'
);

-- Storage: admins need to create staff/{uuid}/training/... and may re-read signed URLs.
drop policy if exists documents_storage_insert_admin_ld_funding on storage.objects;
create policy documents_storage_insert_admin_ld_funding
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'training'
);

drop policy if exists documents_storage_select_admin_ld_funding on storage.objects;
create policy documents_storage_select_admin_ld_funding
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'training'
);

-- Align portal admin helper with admin_or_ceo username overrides (Javi/Raúl/Victor).
create or replace function public.portal_staff_profile_is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select
    public.portal_auth_email_is_achievement_admin()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and (
          sp.app_role in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha', 'victor', 'javi', 'javier', 'raul', 'palankas', 'avi'
          )
        )
    );
$$;

comment on function public.portal_staff_profile_is_portal_admin() is
  'Operations admin: admin/ceo app_role, manager/admin staff_role, achievement emails, or known exec usernames (incl. Javi).';

commit;
