-- Family credits / refunds ledger (visible to parents).
-- Issued when admin excuses an absence with outcome credit|refund, or manually by admin.
-- Phase 1: internal ledger + mark_refunded (no Stripe).

create extension if not exists "uuid-ossp";

create table if not exists public.portal_parent_family_credits (
  id uuid primary key default uuid_generate_v4(),
  parent_person_id text not null,
  contact_id text not null,
  participant_display text not null default '',
  absence_report_id uuid null references public.portal_parent_absence_reports (id) on delete set null,
  -- credit = session/money credit on file; refund = cash/bank refund owed or paid
  kind text not null check (kind in ('credit', 'refund')),
  -- open = available / owed; applied = credit used against booking; refunded = money sent;
  -- cancelled = withdrawn by admin
  status text not null default 'open'
    check (status in ('open', 'applied', 'refunded', 'cancelled')),
  -- Optional £ amount (null = session credit without cash figure yet)
  amount_gbp numeric(10, 2) null check (amount_gbp is null or amount_gbp >= 0),
  currency text not null default 'GBP',
  service_label text not null default '',
  session_date date null,
  notes text null,
  source text not null default 'excused_absence'
    check (source in ('excused_absence', 'admin', 'club_cancellation')),
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  closed_by uuid null references auth.users (id) on delete set null,
  close_notes text null
);

create index if not exists portal_parent_family_credits_parent_idx
  on public.portal_parent_family_credits (parent_person_id, status, created_at desc);

create index if not exists portal_parent_family_credits_contact_idx
  on public.portal_parent_family_credits (contact_id, status, created_at desc);

create index if not exists portal_parent_family_credits_open_idx
  on public.portal_parent_family_credits (status, kind, created_at desc)
  where status = 'open';

-- One ledger row per absence outcome (credit or refund) when linked.
create unique index if not exists portal_parent_family_credits_absence_unique_idx
  on public.portal_parent_family_credits (absence_report_id, kind)
  where absence_report_id is not null;

alter table public.portal_parent_family_credits enable row level security;

revoke all on table public.portal_parent_family_credits from anon, authenticated;
grant select, update on table public.portal_parent_family_credits to authenticated;

drop policy if exists portal_parent_family_credits_select_admin on public.portal_parent_family_credits;
create policy portal_parent_family_credits_select_admin
  on public.portal_parent_family_credits
  for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_family_credits_update_admin on public.portal_parent_family_credits;
create policy portal_parent_family_credits_update_admin
  on public.portal_parent_family_credits
  for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

comment on table public.portal_parent_family_credits is
  'Family-visible credit/refund ledger. Issued on excused absence (or admin). Refunds stay open until mark_refunded; credits until applied/cancelled.';
