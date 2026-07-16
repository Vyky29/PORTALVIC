-- Term invoices: full term amount + embedded instalment plan (re-enrolment).

begin;

alter table public.portal_parent_invoice_share
  add column if not exists amount_paid_gbp numeric(12, 2) not null default 0;

alter table public.portal_parent_invoice_share
  add column if not exists payment_schedule jsonb not null default '[]'::jsonb;

alter table public.portal_parent_invoice_share
  add column if not exists next_instalment_due date null;

alter table public.portal_parent_invoice_share
  add column if not exists billing_term text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_parent_invoice_share_billing_term_check'
  ) then
    alter table public.portal_parent_invoice_share
      add constraint portal_parent_invoice_share_billing_term_check
      check (billing_term is null or billing_term in ('autumn', 'spring', 'summer'));
  end if;
end $$;

comment on column public.portal_parent_invoice_share.amount_paid_gbp is
  'Sum of instalments marked paid on this invoice (term total lives in amount_gbp).';
comment on column public.portal_parent_invoice_share.payment_schedule is
  'Planned instalments [{seq,label,due_date,amount_gbp,status,paid_at,paid_via}].';
comment on column public.portal_parent_invoice_share.next_instalment_due is
  'Due date of the next pending instalment (denormalised for admin lists).';
comment on column public.portal_parent_invoice_share.billing_term is
  'Re-enrolment term: autumn | spring | summer.';

commit;
