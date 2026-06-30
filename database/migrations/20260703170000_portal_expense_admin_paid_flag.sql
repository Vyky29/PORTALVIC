-- Expense claims in documents: admin marks paid (payroll reminder until cleared).

begin;

alter table public.documents
  add column if not exists expense_admin_paid_at timestamptz null,
  add column if not exists expense_admin_paid_by uuid null references auth.users (id) on delete set null;

comment on column public.documents.expense_admin_paid_at is
  'When set, this expense claim was included in payroll / marked paid by admin.';
comment on column public.documents.expense_admin_paid_by is
  'Portal admin user who marked the expense as paid.';

create index if not exists documents_expense_unpaid_idx
  on public.documents (created_at desc)
  where document_type = 'expense' and expense_admin_paid_at is null;

grant update on table public.documents to authenticated;

drop policy if exists documents_select_admin_expenses on public.documents;
create policy documents_select_admin_expenses
on public.documents
for select
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and document_type = 'expense'
);

drop policy if exists documents_update_admin_expenses on public.documents;
create policy documents_update_admin_expenses
on public.documents
for update
to authenticated
using (
  public.portal_staff_profile_is_portal_admin()
  and document_type = 'expense'
)
with check (
  public.portal_staff_profile_is_portal_admin()
  and document_type = 'expense'
);

commit;
