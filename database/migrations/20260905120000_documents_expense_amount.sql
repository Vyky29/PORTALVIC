-- Expense claim total (£) on documents rows (PDF still source of line items).
alter table public.documents
  add column if not exists expense_amount numeric(12, 2);

comment on column public.documents.expense_amount is
  'Expense claim total in GBP when document_type = expense; null for other docs.';

create index if not exists documents_expense_amount_idx
  on public.documents (expense_amount)
  where document_type = 'expense' and expense_amount is not null;
