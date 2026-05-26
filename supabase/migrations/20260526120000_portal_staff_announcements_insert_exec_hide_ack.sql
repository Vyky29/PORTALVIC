-- Mirror of database/migrations/20260526120000_portal_staff_announcements_insert_exec_hide_ack.sql

begin;

alter table public.portal_staff_announcements
  add column if not exists hide_after_ack_amount integer null;

alter table public.portal_staff_announcements
  add column if not exists hide_after_ack_unit text null;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_hide_after_ack_unit_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_hide_after_ack_unit_check
  check (
    hide_after_ack_unit is null
    or hide_after_ack_unit in ('minutes', 'hours', 'days')
  );

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_hide_after_ack_amount_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_hide_after_ack_amount_check
  check (
    hide_after_ack_amount is null
    or hide_after_ack_amount > 0
  );

create or replace function public.portal_staff_profile_is_exec_operator()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
      )
  );
$$;

comment on function public.portal_staff_profile_is_exec_operator() is
  'Admin/ceo app_role OR manager/admin staff_role — same gate as portal DM exec operator.';

revoke all on function public.portal_staff_profile_is_exec_operator() from public;
grant execute on function public.portal_staff_profile_is_exec_operator() to authenticated;

drop policy if exists "portal_staff_announcements_insert_admin_ceo" on public.portal_staff_announcements;

create policy "portal_staff_announcements_insert_admin_ceo"
  on public.portal_staff_announcements
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_exec_operator()
    and (
      (
        delivery_scope = 'everyone'
        and target_user_id is null
        and (target_staff_role is null or btrim(target_staff_role) = '')
      )
      or (
        delivery_scope = 'single_user'
        and target_user_id is not null
        and (target_staff_role is null or btrim(target_staff_role) = '')
      )
      or (
        delivery_scope = 'staff_role'
        and target_staff_role is not null
        and btrim(target_staff_role) <> ''
        and target_user_id is null
      )
    )
    and (
      (hide_after_ack_amount is null and hide_after_ack_unit is null)
      or (
        hide_after_ack_amount is not null
        and hide_after_ack_amount > 0
        and hide_after_ack_unit in ('minutes', 'hours', 'days')
      )
    )
  );

drop policy if exists "portal_staff_announcements_select_admin_ceo" on public.portal_staff_announcements;

create policy "portal_staff_announcements_select_admin_ceo"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

commit;
