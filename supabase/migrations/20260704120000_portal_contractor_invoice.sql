-- Contractor invoices: Sevitha (ops admin) uploads monthly PDF; admin payslips UI lists for accountant.

begin;

drop policy if exists documents_insert_ops_admin_contractor_invoice on public.documents;
create policy documents_insert_ops_admin_contractor_invoice
on public.documents
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.portal_profile_staff_key(auth.uid()) in ('sevitha', 'info')
  and lower(category) = 'payslips'
  and lower(document_type) = 'contractor_invoice'
  and source_page = 'contractor_invoice'
);

drop policy if exists documents_storage_insert_ops_admin_contractor_invoice on storage.objects;
create policy documents_storage_insert_ops_admin_contractor_invoice
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'payslips'
  and public.portal_profile_staff_key(auth.uid()) in ('sevitha', 'info')
);

-- Default login surface: admin dashboard (staff portal via workspace switch).
update public.staff_profiles sp
set
  dashboard_route = 'admin_dashboard.html',
  updated_at = now()
from auth.users au
where sp.id = au.id
  and lower(au.email) in (
    lower('sevitha@clubsensational.org'),
    lower('info@clubsensational.org')
  );

commit;
