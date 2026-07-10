-- Family payment holds: soft hold → cancel one recoverable session → pay to unlock.
-- Hard cut (force plan / permanent pause) stays a manual admin action.

create extension if not exists "uuid-ossp";

create table if not exists public.portal_family_payment_holds (
  id uuid primary key default uuid_generate_v4(),
  contact_id text not null,
  parent_person_id text null,
  status text not null default 'soft_hold'
    check (status in ('soft_hold', 'session_held', 'cleared', 'hard_cut')),
  reason text not null default 'own_arrangement_buffer'
    check (reason in ('own_arrangement_buffer', 'invoice_overdue', 'manual')),
  advance_buffer_gbp numeric(12, 2) null,
  advance_buffer_lines jsonb not null default '[]'::jsonb,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz null,
  held_session_date date null,
  held_session_label text null,
  held_schedule_override_id uuid null,
  trigger_invoice_share_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz null,
  cleared_via text null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null
);

create unique index if not exists portal_family_payment_holds_one_open_per_contact
  on public.portal_family_payment_holds (contact_id)
  where status in ('soft_hold', 'session_held');

create index if not exists portal_family_payment_holds_contact_idx
  on public.portal_family_payment_holds (contact_id, updated_at desc);

create index if not exists portal_family_payment_holds_status_idx
  on public.portal_family_payment_holds (status, updated_at desc);

alter table public.portal_family_payment_holds enable row level security;

revoke all on table public.portal_family_payment_holds from anon, authenticated;
grant select on table public.portal_family_payment_holds to authenticated;

drop policy if exists portal_family_payment_holds_select_admin on public.portal_family_payment_holds;
create policy portal_family_payment_holds_select_admin
  on public.portal_family_payment_holds
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

comment on table public.portal_family_payment_holds is
  'Own-arrangement / overdue payment pressure: soft hold, cancel one recoverable session, clear on pay. Hard cut is admin-only.';
