-- Parent portal v1 — contacts directory, OTP login, short-lived sessions
-- Companion: supabase/migrations/20260624120000_portal_parent_portal_v1.sql
-- Seed data: 20260624120001_portal_parent_contacts_seed.sql

begin;

-- ----------------------------------------------------------------------------
-- 1) Parent / participant contacts (ClassForKids-style export)
-- ----------------------------------------------------------------------------
create table if not exists public.portal_parent_contacts (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         text not null,
  parent_person_id   text not null,
  child_display      text not null,
  child_first_name   text,
  child_last_name    text,
  parent_display     text not null,
  parent_first_name  text,
  parent_last_name   text,
  email              text,
  mobile             text,
  phone_lookup       text generated always as (
    right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10)
  ) stored,
  email_norm         text generated always as (
    nullif(lower(trim(coalesce(email, ''))), '')
  ) stored,
  address_line1      text,
  address_line2      text,
  city               text,
  postcode           text,
  dob_iso            date,
  in_class           boolean,
  on_waiting_list    boolean,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists portal_parent_contacts_contact_id_uidx
  on public.portal_parent_contacts (contact_id);

create index if not exists portal_parent_contacts_parent_person_idx
  on public.portal_parent_contacts (parent_person_id);

create index if not exists portal_parent_contacts_phone_lookup_idx
  on public.portal_parent_contacts (phone_lookup)
  where phone_lookup is not null and phone_lookup <> '';

create index if not exists portal_parent_contacts_email_norm_idx
  on public.portal_parent_contacts (email_norm)
  where email_norm is not null;

comment on table public.portal_parent_contacts is
  'Parent/carer ↔ participant links for the parent portal (seeded from ClassForKids export).';

-- ----------------------------------------------------------------------------
-- 2) Identity match (service_role only — anti-enumeration)
-- ----------------------------------------------------------------------------
create or replace function public.portal_parent_match_identity(
  p_full_name text,
  p_phone     text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select
      public.portal_normalize_full_name(p_full_name) as fn_norm,
      public.portal_normalize_phone_digits(p_phone)   as ph_norm
  ),
  candidates as (
    select distinct c.parent_person_id
    from public.portal_parent_contacts c, norm
    where norm.fn_norm <> ''
      and norm.ph_norm <> ''
      and length(norm.ph_norm) >= 7
      and c.phone_lookup = right(norm.ph_norm, 10)
      and (
        public.portal_normalize_full_name(c.parent_display) = norm.fn_norm
        or public.portal_normalize_full_name(
             trim(coalesce(c.parent_first_name, '') || ' ' || coalesce(c.parent_last_name, ''))
           ) = norm.fn_norm
      )
    limit 2
  ),
  agg as (
    select array_agg(parent_person_id) as ids, count(*) as n
    from candidates
  )
  select case when n = 1 then ids[1] else null end
  from agg;
$$;

revoke all on function public.portal_parent_match_identity(text, text) from public;
revoke all on function public.portal_parent_match_identity(text, text) from anon;
revoke all on function public.portal_parent_match_identity(text, text) from authenticated;
grant execute on function public.portal_parent_match_identity(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) OTP table
-- ----------------------------------------------------------------------------
create table if not exists public.portal_parent_portal_otps (
  id                uuid primary key default gen_random_uuid(),
  parent_person_id  text not null,
  code_hash         text not null,
  channel           text not null check (channel in ('whatsapp', 'sms', 'log')),
  destination       text not null,
  expires_at        timestamptz not null,
  attempts          smallint not null default 0,
  consumed_at       timestamptz,
  created_at        timestamptz not null default now(),
  ip_hash           text,
  user_agent_hash   text
);

create index if not exists portal_parent_portal_otps_parent_idx
  on public.portal_parent_portal_otps (parent_person_id, created_at desc);

alter table public.portal_parent_portal_otps enable row level security;
revoke all on public.portal_parent_portal_otps from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Short-lived session tokens (post-OTP)
-- ----------------------------------------------------------------------------
create table if not exists public.portal_parent_portal_sessions (
  id                uuid primary key default gen_random_uuid(),
  parent_person_id  text not null,
  token_hash        text not null unique,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  ip_hash           text,
  user_agent_hash   text
);

create index if not exists portal_parent_portal_sessions_parent_idx
  on public.portal_parent_portal_sessions (parent_person_id, issued_at desc);

create index if not exists portal_parent_portal_sessions_token_idx
  on public.portal_parent_portal_sessions (token_hash);

alter table public.portal_parent_portal_sessions enable row level security;
revoke all on public.portal_parent_portal_sessions from public, anon, authenticated;

grant select, insert, update, delete on public.portal_parent_contacts to service_role;

commit;
