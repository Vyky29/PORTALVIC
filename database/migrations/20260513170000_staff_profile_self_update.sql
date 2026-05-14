-- Staff Profile Self-Service Update flow (mobile, OTP-gated)
-- ----------------------------------------------------------------------------
-- Adds the columns the new working_ui/staff_profile_update.html page reads/writes,
-- plus the OTP / temporary session / audit log tables that the
-- staff-profile-otp-* and staff-profile-update-* Edge Functions use.
--
-- Safe to re-run (every DDL uses IF NOT EXISTS / OR REPLACE).
--
-- Companion file: supabase/migrations/20260513170000_staff_profile_self_update.sql
-- ----------------------------------------------------------------------------

begin;

-- ----------------------------------------------------------------------------
-- 1) staff_profiles: extra self-service columns
-- ----------------------------------------------------------------------------
alter table public.staff_profiles
  add column if not exists phone_e164                       text,
  add column if not exists phone_lookup                     text generated always as (regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g')) stored,
  add column if not exists email_personal                   text,
  add column if not exists address_line1                    text,
  add column if not exists address_line2                    text,
  add column if not exists address_city                     text,
  add column if not exists address_postcode                 text,
  add column if not exists emergency_contact_name           text,
  add column if not exists emergency_contact_relationship   text,
  add column if not exists emergency_contact_phone          text,
  add column if not exists availability_summary             text,
  add column if not exists availability_status              text,
  add column if not exists availability_changes             jsonb,
  add column if not exists other_work_status                text,
  add column if not exists other_work_organisation          text,
  add column if not exists other_work_schedule              text,
  add column if not exists other_work_affects_availability  boolean,
  add column if not exists wellbeing_notes                  text,
  add column if not exists profile_last_confirmed_at        timestamptz,
  add column if not exists profile_last_updated_at          timestamptz;

create index if not exists staff_profiles_phone_lookup_idx
  on public.staff_profiles (phone_lookup)
  where phone_lookup is not null and phone_lookup <> '';

-- Sanity-check enums via CHECKs (kept lenient; UI is the canonical control)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_availability_status_chk'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_availability_status_chk
      check (availability_status is null or availability_status in ('continue','reduce','increase','unsure'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_other_work_status_chk'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_other_work_status_chk
      check (other_work_status is null or other_work_status in ('only_clubsensational','also_other'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Helpers (normalisation + safe identity match — no enumeration)
-- ----------------------------------------------------------------------------
create or replace function public.portal_normalize_full_name(p text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
           lower(
             translate(
               coalesce(p, ''),
               'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç''’´`',
               'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc      '
             )
           ),
           '\s+', ' ', 'g'
         ));
$$;

create or replace function public.portal_normalize_phone_digits(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- match_identity: SECURITY DEFINER so the anon key cannot read staff_profiles
-- directly; this returns ONLY the matched id (or NULL) and is meant for the
-- Edge Function to use server-side. Anon role is *not* granted execute.
create or replace function public.staff_profile_match_identity(
  p_full_name text,
  p_phone     text
)
returns uuid
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
    select sp.id
    from public.staff_profiles sp, norm
    where coalesce(sp.is_active, true)
      and norm.fn_norm <> ''
      and norm.ph_norm <> ''
      and length(norm.ph_norm) >= 7
      and (
        public.portal_normalize_full_name(sp.full_name) = norm.fn_norm
        or public.portal_normalize_full_name(sp.username) = norm.fn_norm
      )
      and right(sp.phone_lookup, 10) = right(norm.ph_norm, 10)
    limit 2
  ),
  agg as (
    select array_agg(id) as ids, count(*) as n
    from candidates
  )
  select case when n = 1 then ids[1] else null end
  from agg;
$$;

revoke all on function public.staff_profile_match_identity(text, text) from public;
revoke all on function public.staff_profile_match_identity(text, text) from anon;
revoke all on function public.staff_profile_match_identity(text, text) from authenticated;
grant execute on function public.staff_profile_match_identity(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3) OTP table
-- ----------------------------------------------------------------------------
create table if not exists public.staff_profile_update_otps (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  code_hash       text not null,
  channel         text not null check (channel in ('whatsapp','sms','log')),
  destination     text not null,
  expires_at      timestamptz not null,
  attempts        smallint not null default 0,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now(),
  ip_hash         text,
  user_agent_hash text
);

create index if not exists staff_profile_update_otps_staff_idx
  on public.staff_profile_update_otps (staff_id, created_at desc);
create index if not exists staff_profile_update_otps_active_idx
  on public.staff_profile_update_otps (staff_id)
  where consumed_at is null;

alter table public.staff_profile_update_otps enable row level security;
-- Locked down: only service_role (Edge Functions) may touch this table.
revoke all on public.staff_profile_update_otps from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Temporary session token table (post-OTP)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_profile_update_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  token_hash      text not null unique,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  ip_hash         text,
  user_agent_hash text
);

create index if not exists staff_profile_update_sessions_staff_idx
  on public.staff_profile_update_sessions (staff_id, issued_at desc);
create index if not exists staff_profile_update_sessions_token_idx
  on public.staff_profile_update_sessions (token_hash);

alter table public.staff_profile_update_sessions enable row level security;
revoke all on public.staff_profile_update_sessions from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) Change log (audit trail of field-level diffs)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_profile_change_log (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.staff_profiles(id) on delete cascade,
  section         text not null,
  field_name      text not null,
  previous_value  text,
  new_value       text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  source          text not null default 'staff_self_update',
  ip_hash         text,
  user_agent_hash text
);

create index if not exists staff_profile_change_log_staff_idx
  on public.staff_profile_change_log (staff_id, updated_at desc);

alter table public.staff_profile_change_log enable row level security;
revoke all on public.staff_profile_change_log from public, anon, authenticated;

-- Admin / CEO can read everyone's audit log (uses existing recursion-safe helper).
drop policy if exists "staff_profile_change_log_admin_read" on public.staff_profile_change_log;
create policy "staff_profile_change_log_admin_read"
  on public.staff_profile_change_log
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

-- A staff member can read their own audit trail (when signed in via the normal portal).
drop policy if exists "staff_profile_change_log_self_read" on public.staff_profile_change_log;
create policy "staff_profile_change_log_self_read"
  on public.staff_profile_change_log
  for select
  to authenticated
  using ((select auth.uid()) = staff_id);

commit;
