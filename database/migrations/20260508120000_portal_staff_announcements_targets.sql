-- Targeted staff announcements: everyone, by staff_role, or single user.
-- Requires prior migration 20260504120000_portal_staff_announcements.sql.
-- Adds staff_profiles read policy for admin/CEO directory (no self-reference recursion).

begin;

alter table public.portal_staff_announcements
  add column if not exists delivery_scope text not null default 'everyone';

alter table public.portal_staff_announcements
  add column if not exists target_staff_role text null;

alter table public.portal_staff_announcements
  add column if not exists target_user_id uuid null references auth.users (id) on delete set null;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_delivery_scope_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_delivery_scope_check
  check (delivery_scope in ('everyone', 'staff_role', 'single_user'));

comment on column public.portal_staff_announcements.delivery_scope is
  'everyone = broadcast within audience_scope; staff_role = only staff_profiles.staff_role = target_staff_role; single_user = only target_user_id.';

comment on column public.portal_staff_announcements.target_staff_role is
  'When delivery_scope = staff_role, matches staff_profiles.staff_role (swimming, support, fitness, climbing, manager, admin).';

-- Admin / CEO: read full staff directory for compose pickers.
-- Must use SECURITY DEFINER helper: a policy on staff_profiles cannot subquery staff_profiles
-- (re-enters RLS → "infinite recursion detected in policy for relation staff_profiles").
create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.app_role in ('admin', 'ceo')
  );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'True when current user is admin/ceo in staff_profiles. SECURITY DEFINER avoids RLS recursion when used from staff_profiles policies.';

revoke all on function public.portal_staff_profile_is_admin_or_ceo() from public;
grant execute on function public.portal_staff_profile_is_admin_or_ceo() to authenticated;

drop policy if exists "staff_profiles_admin_ceo_directory_read" on public.staff_profiles;
create policy "staff_profiles_admin_ceo_directory_read"
  on public.staff_profiles
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

-- Replace announcements staff SELECT with targeted rules
drop policy if exists "portal_staff_announcements_select_staff_all" on public.portal_staff_announcements;
create policy "portal_staff_announcements_select_staff_all"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role = 'staff'
    )
    and (ends_at is null or ends_at >= now())
    and (
      (
        audience_scope = 'all_staff'
        and delivery_scope = 'everyone'
        and (target_user_id is null)
        and (target_staff_role is null or btrim(target_staff_role) = '')
      )
      or (
        audience_scope = 'all_staff'
        and delivery_scope = 'single_user'
        and target_user_id = auth.uid()
      )
      or (
        audience_scope = 'all_staff'
        and delivery_scope = 'staff_role'
        and target_staff_role is not null
        and btrim(target_staff_role) <> ''
        and exists (
          select 1
          from public.staff_profiles me
          where me.id = auth.uid()
            and me.staff_role is not null
            and me.staff_role::text = portal_staff_announcements.target_staff_role
        )
      )
    )
  );

drop policy if exists "portal_staff_announcements_select_lead" on public.portal_staff_announcements;
create policy "portal_staff_announcements_select_lead"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role = 'lead'
    )
    and (ends_at is null or ends_at >= now())
    and (
      (
        audience_scope = 'all_staff'
        and delivery_scope = 'everyone'
        and (target_user_id is null)
        and (target_staff_role is null or btrim(target_staff_role) = '')
      )
      or (audience_scope = 'leads' and delivery_scope = 'everyone')
      or (
        audience_scope = 'all_staff'
        and delivery_scope = 'single_user'
        and target_user_id = auth.uid()
      )
      or (
        audience_scope = 'all_staff'
        and delivery_scope = 'staff_role'
        and target_staff_role is not null
        and btrim(target_staff_role) <> ''
        and exists (
          select 1
          from public.staff_profiles me
          where me.id = auth.uid()
            and me.staff_role is not null
            and me.staff_role::text = portal_staff_announcements.target_staff_role
        )
      )
    )
  );

-- Tighten INSERT: delivery_scope must match targets
drop policy if exists "portal_staff_announcements_insert_admin_ceo" on public.portal_staff_announcements;
create policy "portal_staff_announcements_insert_admin_ceo"
  on public.portal_staff_announcements
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('admin', 'ceo')
    )
    and (
      (delivery_scope = 'everyone' and target_user_id is null and (target_staff_role is null or btrim(target_staff_role) = ''))
      or (delivery_scope = 'single_user' and target_user_id is not null and (target_staff_role is null or btrim(target_staff_role) = ''))
      or (
        delivery_scope = 'staff_role'
        and target_staff_role is not null
        and btrim(target_staff_role) <> ''
        and target_user_id is null
      )
    )
  );

commit;
