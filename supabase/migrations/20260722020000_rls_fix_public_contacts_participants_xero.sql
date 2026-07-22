-- Fix Security Advisor: rls_disabled_in_public (Portal project).
-- Confirmed 2026-07-22: these four public tables had RLS OFF and GRANT SELECT to anon,
-- so anyone with the project URL + anon key could read rows (incl. parent/participant PII).
--
-- Scope:
--   portal_parent_contacts   — staff SELECT only; writes stay service_role / Edge
--   portal_participants      — enable existing portal_participants_select_staff policy
--   portal_xero_items        — service_role only (Edge)
--   portal_xero_product_map  — service_role only (Edge)

begin;

-- ---------------------------------------------------------------------------
-- 1) portal_participants — policy already exists; just turn RLS on + revoke anon
-- ---------------------------------------------------------------------------
alter table public.portal_participants enable row level security;

revoke all on table public.portal_participants from public;
revoke all on table public.portal_participants from anon;
grant select on table public.portal_participants to authenticated;
grant select, insert, update, delete on table public.portal_participants to service_role;

drop policy if exists portal_participants_select_staff on public.portal_participants;
create policy portal_participants_select_staff
  on public.portal_participants
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

-- ---------------------------------------------------------------------------
-- 2) portal_parent_contacts — PII; staff/admin read from admin UI
-- ---------------------------------------------------------------------------
alter table public.portal_parent_contacts enable row level security;

revoke all on table public.portal_parent_contacts from public;
revoke all on table public.portal_parent_contacts from anon;
grant select on table public.portal_parent_contacts to authenticated;
grant select, insert, update, delete on table public.portal_parent_contacts to service_role;

drop policy if exists portal_parent_contacts_select_staff on public.portal_parent_contacts;
create policy portal_parent_contacts_select_staff
  on public.portal_parent_contacts
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

-- ---------------------------------------------------------------------------
-- 3) Xero catalog — Edge/service_role only (original migration intent)
-- ---------------------------------------------------------------------------
alter table public.portal_xero_items enable row level security;
alter table public.portal_xero_product_map enable row level security;

revoke all on table public.portal_xero_items from public, anon, authenticated;
revoke all on table public.portal_xero_product_map from public, anon, authenticated;

grant select, insert, update, delete on table public.portal_xero_items to service_role;
grant select, insert, update, delete on table public.portal_xero_product_map to service_role;

commit;
