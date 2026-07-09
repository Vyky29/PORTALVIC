-- Makeup grants: for absents without valid proof (couldn't prove / window passed).
-- Admin offers a concrete slot BY VENUE (waiting-list style). Decline = forfeit grant (offer goes to next family).

create extension if not exists "uuid-ossp";

create table if not exists public.portal_parent_makeup_grants (
  id uuid primary key default uuid_generate_v4(),
  parent_person_id text not null,
  contact_id text not null,
  participant_display text not null default '',
  absence_report_id uuid null references public.portal_parent_absence_reports (id) on delete set null,
  -- Preferred venue for offers (so we do not offer a different centre).
  preferred_venue text not null default '',
  service_label text not null default '',
  -- open = waiting for an offer; offered = live offer out; consumed = parent accepted;
  -- forfeited = parent declined (lost); cancelled = admin withdrew.
  status text not null default 'open'
    check (status in ('open', 'offered', 'consumed', 'forfeited', 'cancelled')),
  source text not null default 'no_proof'
    check (source in ('no_proof', 'expired_window', 'admin', 'excused_makeup')),
  notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create index if not exists portal_parent_makeup_grants_status_idx
  on public.portal_parent_makeup_grants (status, preferred_venue, created_at);

create index if not exists portal_parent_makeup_grants_parent_idx
  on public.portal_parent_makeup_grants (parent_person_id, created_at desc);

create index if not exists portal_parent_makeup_grants_contact_idx
  on public.portal_parent_makeup_grants (contact_id, status);

create unique index if not exists portal_parent_makeup_grants_absence_unique_idx
  on public.portal_parent_makeup_grants (absence_report_id)
  where absence_report_id is not null;

create table if not exists public.portal_parent_makeup_offers (
  id uuid primary key default uuid_generate_v4(),
  grant_id uuid not null references public.portal_parent_makeup_grants (id) on delete cascade,
  parent_person_id text not null,
  contact_id text not null,
  -- Offer is always scoped to a venue (club policy: offer by venue).
  venue text not null,
  session_date date not null,
  session_time text not null default '',
  service_label text not null default '',
  instructor_name text not null default '',
  area text not null default '',
  offer_notes text null,
  -- pending = waiting on parent; accepted | declined | withdrawn | expired
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  decline_reason text null,
  offered_by uuid null references auth.users (id) on delete set null,
  offered_at timestamptz not null default now(),
  responded_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists portal_parent_makeup_offers_grant_idx
  on public.portal_parent_makeup_offers (grant_id, status);

create index if not exists portal_parent_makeup_offers_pending_idx
  on public.portal_parent_makeup_offers (status, venue, session_date)
  where status = 'pending';

create index if not exists portal_parent_makeup_offers_parent_idx
  on public.portal_parent_makeup_offers (parent_person_id, status, offered_at desc);

-- Only one pending offer per grant at a time.
create unique index if not exists portal_parent_makeup_offers_one_pending_idx
  on public.portal_parent_makeup_offers (grant_id)
  where status = 'pending';

alter table public.portal_parent_makeup_grants enable row level security;
alter table public.portal_parent_makeup_offers enable row level security;

revoke all on table public.portal_parent_makeup_grants from anon, authenticated;
revoke all on table public.portal_parent_makeup_offers from anon, authenticated;
grant select, update on table public.portal_parent_makeup_grants to authenticated;
grant select, update on table public.portal_parent_makeup_offers to authenticated;

drop policy if exists portal_parent_makeup_grants_select_admin on public.portal_parent_makeup_grants;
create policy portal_parent_makeup_grants_select_admin
  on public.portal_parent_makeup_grants
  for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_makeup_grants_update_admin on public.portal_parent_makeup_grants;
create policy portal_parent_makeup_grants_update_admin
  on public.portal_parent_makeup_grants
  for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_makeup_offers_select_admin on public.portal_parent_makeup_offers;
create policy portal_parent_makeup_offers_select_admin
  on public.portal_parent_makeup_offers
  for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_makeup_offers_update_admin on public.portal_parent_makeup_offers;
create policy portal_parent_makeup_offers_update_admin
  on public.portal_parent_makeup_offers
  for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

comment on table public.portal_parent_makeup_grants is
  'Makeup entitlement for absents without valid proof. Offered by venue; decline forfeits the grant.';

comment on table public.portal_parent_makeup_offers is
  'Concrete makeup slot offer (venue-scoped). Accept consumes grant; decline forfeits grant so the slot can go to the next family.';
