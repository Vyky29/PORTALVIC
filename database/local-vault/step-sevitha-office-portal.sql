-- Sevitha office portal + payslip upload permissions (Portal cklpnwhlqsulpmkipmqb)
-- Run via: npm run apply:sevitha-office-portal

-- 1) RLS helpers + Sevitha staff_profiles (office_portal home)
-- from 20260620210000_portal_sevitha_admin_documents_access.sql

create or replace function public.portal_staff_profile_is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
        or public.portal_profile_staff_key(sp.id) in ('sevitha')
      )
  );
$$;

comment on function public.portal_staff_profile_is_portal_admin() is
  'Operations admin dashboard: admin/ceo app_role, manager staff_role, or Sevitha username override.';

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or public.portal_profile_staff_key(sp.id) in ('sevitha', 'victor', 'javi', 'javier', 'raul')
      )
  );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'Admin/CEO directory reads: app_role admin/ceo or portal username overrides (incl. Sevitha).';

insert into public.staff_profiles (
  id,
  full_name,
  username,
  app_role,
  staff_role,
  dashboard_route,
  is_active
)
select
  au.id,
  'Sevitha',
  'Sevitha',
  'admin',
  'admin',
  'office_portal.html',
  true
from auth.users au
where lower(au.email) in (
  lower('sevitha@clubsensational.org'),
  lower('info@clubsensational.org')
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  username = excluded.username,
  app_role = 'admin',
  staff_role = excluded.staff_role,
  dashboard_route = 'office_portal.html',
  is_active = true;

-- 2) Payslip upload RLS for admin/Sevitha
-- from 20260610140000_portal_payslips_documents.sql

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own
on public.documents
for insert
to authenticated
with check (
  user_id = auth.uid()
  and lower(category) <> 'payslips'
);

drop policy if exists documents_insert_admin_payslips on public.documents;
create policy documents_insert_admin_payslips
on public.documents
for insert
to authenticated
with check (
  public.portal_staff_profile_is_portal_admin()
  and lower(category) = 'payslips'
  and lower(document_type) = 'payslip'
  and source_page = 'payslips'
);

drop policy if exists documents_select_admin_payslips on public.documents;
create policy documents_select_admin_payslips
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and lower(category) = 'payslips'
);

drop policy if exists documents_storage_insert_admin_payslips on storage.objects;
create policy documents_storage_insert_admin_payslips
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.portal_staff_profile_is_portal_admin()
  and (storage.foldername(name))[2] = 'payslips'
);

-- 3) dashboard_route reconcile (20260613180000 + 20260621120000)

update public.staff_profiles sp
set
  dashboard_route = 'office_portal.html',
  updated_at = now()
from auth.users au
where sp.id = au.id
  and lower(au.email) in (
    lower('sevitha@clubsensational.org'),
    lower('info@clubsensational.org')
  );

comment on column public.staff_profiles.dashboard_route is
  'Post-login static page under working_ui/. Sevitha uses office_portal.html; executives use admin_dashboard.html.';
