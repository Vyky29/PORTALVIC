-- Commissioning / Local Authority Terms & Conditions + placement/PO ledger.
-- Additive only: does not alter family terms_and_conditions or re-enrolment declarations.

begin;

-- ---------------------------------------------------------------------------
-- Feature / finance settings (late fees stay null until director sets them)
-- ---------------------------------------------------------------------------
create table if not exists public.portal_commissioning_finance_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.portal_commissioning_finance_settings (key, value_json)
values
  (
    'feature_flags',
    jsonb_build_object(
      'commissioning_terms_enabled', true,
      'commissioning_attendance_hard_block', false
    )
  ),
  (
    'late_payment',
    jsonb_build_object(
      'interest_bps', null,
      'recovery_fee_pence', null,
      'enabled', false
    )
  )
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Versioned documents
-- ---------------------------------------------------------------------------
create table if not exists public.portal_terms_documents (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('family', 'commissioning')),
  slug text not null,
  version text not null,
  title text not null,
  public_path text not null,
  content_hash text,
  effective_from date not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'superseded', 'retired')),
  created_at timestamptz not null default now(),
  unique (audience, version)
);

create index if not exists portal_terms_documents_audience_status_idx
  on public.portal_terms_documents (audience, status, effective_from desc);

insert into public.portal_terms_documents (
  audience, slug, version, title, public_path, content_hash, effective_from, status
) values (
  'commissioning',
  'la-commissioning-terms',
  '1.0',
  'Local Authority and Commissioning Organisation Terms & Conditions',
  '/commissioning/terms',
  'v1.0-2026-07-20',
  '2026-07-20',
  'active'
) on conflict (audience, version) do nothing;

insert into public.portal_terms_documents (
  audience, slug, version, title, public_path, content_hash, effective_from, status
) values (
  'family',
  'family-terms',
  '2026-27',
  'Terms & Conditions (families / private payers)',
  '/parent/terms',
  'family-2026-27',
  '2026-07-01',
  'active'
) on conflict (audience, version) do nothing;

-- ---------------------------------------------------------------------------
-- Commissioning organisations
-- ---------------------------------------------------------------------------
create table if not exists public.portal_commissioning_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null default 'local_authority'
    check (org_type in (
      'local_authority', 'nhs', 'school_college', 'social_care',
      'education_provider', 'other_commissioning', 'family_private'
    )),
  department text,
  main_contact_name text,
  main_contact_email text,
  finance_contact_name text,
  finance_contact_email text,
  po_contact_name text,
  po_contact_email text,
  invoice_submission_method text,
  invoice_email_or_portal text,
  payment_terms_days int default 30,
  payment_in_arrears boolean not null default true,
  invoice_submission_window_days int default 15,
  notice_period_days int not null default 28,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_commissioning_orgs_type_idx
  on public.portal_commissioning_orgs (org_type, active);

-- ---------------------------------------------------------------------------
-- Send / view / accept trail
-- ---------------------------------------------------------------------------
create table if not exists public.portal_terms_send_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.portal_terms_documents(id),
  org_id uuid references public.portal_commissioning_orgs(id) on delete set null,
  participant_contact_id text,
  recipient_email text,
  recipient_name text,
  recipient_role text,
  status text not null default 'sent'
    check (status in ('not_sent', 'sent', 'viewed', 'accepted', 'expired', 'superseded')),
  token_hash text not null,
  token_expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists portal_terms_send_events_token_hash_uidx
  on public.portal_terms_send_events (token_hash);

create index if not exists portal_terms_send_events_org_idx
  on public.portal_terms_send_events (org_id, created_at desc);

create table if not exists public.portal_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.portal_terms_documents(id),
  send_event_id uuid references public.portal_terms_send_events(id) on delete set null,
  org_id uuid references public.portal_commissioning_orgs(id) on delete set null,
  organisation_name text not null,
  accepted_by_name text not null,
  accepted_by_role text,
  accepted_by_email text not null,
  po_reference text,
  participant_contact_id text,
  accepted_at timestamptz not null default now(),
  document_version text not null,
  document_content_hash text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create index if not exists portal_terms_acceptances_org_idx
  on public.portal_terms_acceptances (org_id, accepted_at desc);

create index if not exists portal_terms_acceptances_document_idx
  on public.portal_terms_acceptances (document_id, accepted_at desc);

-- ---------------------------------------------------------------------------
-- Placements (reserved vs approved to attend)
-- ---------------------------------------------------------------------------
create table if not exists public.portal_commissioning_placements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.portal_commissioning_orgs(id) on delete cascade,
  participant_contact_id text,
  participant_name text,
  academic_year text,
  service_label text,
  status text not null default 'proposed'
    check (status in (
      'proposed',
      'awaiting_terms_acceptance',
      'awaiting_po',
      'reserved_chargeable',
      'approved_to_attend',
      'active',
      'suspended',
      'ended'
    )),
  proposed_at timestamptz,
  reservation_date date,
  chargeable_from date,
  attendance_authorised_from date,
  service_start_date date,
  funding_review_date date,
  fee_review_date date,
  final_payment_month text,
  venue text,
  sessions_per_week numeric(6,2),
  session_rate_pence int,
  terms_document_id uuid references public.portal_terms_documents(id),
  terms_acceptance_id uuid references public.portal_terms_acceptances(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_commissioning_placements_org_idx
  on public.portal_commissioning_placements (org_id, status);

create index if not exists portal_commissioning_placements_participant_idx
  on public.portal_commissioning_placements (participant_contact_id);

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create table if not exists public.portal_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.portal_commissioning_orgs(id) on delete cascade,
  placement_id uuid references public.portal_commissioning_placements(id) on delete set null,
  po_number text not null,
  participant_name_or_ref text,
  service_label text,
  sessions_approved numeric(8,2),
  session_rate_pence int,
  start_date date,
  end_date date,
  funding_period_label text,
  total_value_pence bigint,
  remaining_balance_pence bigint,
  status text not null default 'requested'
    check (status in (
      'requested', 'received', 'invalid_incomplete', 'amendment_required',
      'active', 'exhausted', 'expired', 'cancelled'
    )),
  academic_year text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_purchase_orders_org_idx
  on public.portal_purchase_orders (org_id, status);

create index if not exists portal_purchase_orders_number_idx
  on public.portal_purchase_orders (po_number);

-- ---------------------------------------------------------------------------
-- Director overrides (attendance continue, credit review, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.portal_commissioning_director_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.portal_commissioning_orgs(id) on delete set null,
  placement_id uuid references public.portal_commissioning_placements(id) on delete set null,
  action text not null
    check (action in (
      'suspend_attendance',
      'continue_temporarily',
      'request_po_amendment',
      'stop_new_referrals',
      'credit_review',
      'authorise_attendance_without_po',
      'other'
    )),
  reason text not null,
  supporting_note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists portal_commissioning_director_overrides_placement_idx
  on public.portal_commissioning_director_overrides (placement_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: admin/ceo only (service role bypasses for Edge Functions)
-- ---------------------------------------------------------------------------
alter table public.portal_commissioning_finance_settings enable row level security;
alter table public.portal_terms_documents enable row level security;
alter table public.portal_commissioning_orgs enable row level security;
alter table public.portal_terms_send_events enable row level security;
alter table public.portal_terms_acceptances enable row level security;
alter table public.portal_commissioning_placements enable row level security;
alter table public.portal_purchase_orders enable row level security;
alter table public.portal_commissioning_director_overrides enable row level security;

grant select, insert, update, delete on table public.portal_commissioning_finance_settings to authenticated;
grant select on table public.portal_terms_documents to authenticated, anon;
grant select, insert, update, delete on table public.portal_commissioning_orgs to authenticated;
grant select, insert, update, delete on table public.portal_terms_send_events to authenticated;
grant select on table public.portal_terms_acceptances to authenticated;
grant select, insert, update, delete on table public.portal_commissioning_placements to authenticated;
grant select, insert, update, delete on table public.portal_purchase_orders to authenticated;
grant select, insert on table public.portal_commissioning_director_overrides to authenticated;

create or replace function public.portal_staff_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  );
$$;

revoke all on function public.portal_staff_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_is_admin_or_ceo() to authenticated;

drop policy if exists portal_commissioning_finance_settings_admin on public.portal_commissioning_finance_settings;
create policy portal_commissioning_finance_settings_admin
on public.portal_commissioning_finance_settings for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_terms_documents_read on public.portal_terms_documents;
create policy portal_terms_documents_read
on public.portal_terms_documents for select to authenticated, anon
using (status = 'active' or public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_terms_documents_admin_write on public.portal_terms_documents;
create policy portal_terms_documents_admin_write
on public.portal_terms_documents for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_commissioning_orgs_admin on public.portal_commissioning_orgs;
create policy portal_commissioning_orgs_admin
on public.portal_commissioning_orgs for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_terms_send_events_admin on public.portal_terms_send_events;
create policy portal_terms_send_events_admin
on public.portal_terms_send_events for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_terms_acceptances_admin_read on public.portal_terms_acceptances;
create policy portal_terms_acceptances_admin_read
on public.portal_terms_acceptances for select to authenticated
using (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_commissioning_placements_admin on public.portal_commissioning_placements;
create policy portal_commissioning_placements_admin
on public.portal_commissioning_placements for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_purchase_orders_admin on public.portal_purchase_orders;
create policy portal_purchase_orders_admin
on public.portal_purchase_orders for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

drop policy if exists portal_commissioning_director_overrides_admin on public.portal_commissioning_director_overrides;
create policy portal_commissioning_director_overrides_admin
on public.portal_commissioning_director_overrides for all to authenticated
using (public.portal_staff_is_admin_or_ceo())
with check (public.portal_staff_is_admin_or_ceo());

comment on table public.portal_terms_documents is
  'Versioned Terms documents. Family rows are catalog-only; acceptance ledger is for commissioning.';
comment on table public.portal_commissioning_placements is
  'reserved_chargeable ≠ approved_to_attend. Hard attendance block is feature-flagged off by default.';

commit;
