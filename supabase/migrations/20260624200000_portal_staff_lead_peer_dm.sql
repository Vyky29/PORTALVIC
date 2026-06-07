-- Staff ↔ lead peer DMs (photos/docs via direct message insert + Storage RLS on thread).
-- Admins with shared inbox already SELECT all threads; this enables thread create + directories.

begin;

create or replace function public.portal_staff_profile_is_lead_app_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = user_id
      and sp.is_active is distinct from false
      and lower(coalesce(sp.app_role, '')) = 'lead'
  );
$$;

comment on function public.portal_staff_profile_is_lead_app_user(uuid) is
  'True when user_id is an active lead (app_role lead) in staff_profiles.';

revoke all on function public.portal_staff_profile_is_lead_app_user(uuid) from public;
grant execute on function public.portal_staff_profile_is_lead_app_user(uuid) to authenticated;

create or replace function public.portal_staff_profile_is_staff_side_user(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = user_id
      and sp.is_active is distinct from false
      and lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo', 'lead')
      and (
        lower(coalesce(sp.app_role, '')) = 'staff'
        or (
          lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
          and lower(coalesce(sp.staff_role, '')) in (
            'swimming', 'climbing', 'fitness', 'support', 'support_lead'
          )
        )
      )
  );
$$;

comment on function public.portal_staff_profile_is_staff_side_user(uuid) is
  'Pool staff / app_role staff — not admin, CEO, or lead. Used for staff↔lead peer chat.';

revoke all on function public.portal_staff_profile_is_staff_side_user(uuid) from public;
grant execute on function public.portal_staff_profile_is_staff_side_user(uuid) to authenticated;

create or replace function public.portal_staff_profile_is_lead_only_messenger()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.portal_staff_profile_is_lead_app_user((select auth.uid()));
$$;

comment on function public.portal_staff_profile_is_lead_only_messenger() is
  'True when current user is an active lead messenger.';

revoke all on function public.portal_staff_profile_is_lead_only_messenger() from public;
grant execute on function public.portal_staff_profile_is_lead_only_messenger() to authenticated;

create or replace function public.portal_staff_profile_is_staff_only_messenger()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.portal_staff_profile_is_staff_side_user((select auth.uid()));
$$;

comment on function public.portal_staff_profile_is_staff_only_messenger() is
  'True when current user is staff-side (not lead/admin/CEO).';

revoke all on function public.portal_staff_profile_is_staff_only_messenger() from public;
grant execute on function public.portal_staff_profile_is_staff_only_messenger() to authenticated;

create or replace function public.portal_staff_profile_is_staff_lead_cross_peer(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.staff_profiles me
    where me.id = (select auth.uid())
      and me.is_active is distinct from false
      and me.id <> user_id
      and public.portal_staff_profile_is_staff_or_lead_messenger()
      and (
        (
          public.portal_staff_profile_is_lead_app_user((select auth.uid()))
          and public.portal_staff_profile_is_staff_side_user(user_id)
        )
        or (
          public.portal_staff_profile_is_staff_side_user((select auth.uid()))
          and public.portal_staff_profile_is_lead_app_user(user_id)
        )
      )
  );
$$;

comment on function public.portal_staff_profile_is_staff_lead_cross_peer(uuid) is
  'True when user_id is the opposite side of a staff↔lead peer DM (caller must be staff or lead).';

revoke all on function public.portal_staff_profile_is_staff_lead_cross_peer(uuid) from public;
grant execute on function public.portal_staff_profile_is_staff_lead_cross_peer(uuid) to authenticated;

drop policy if exists "portal_staff_dm_threads_insert_staff_lead_to_office" on public.portal_staff_dm_threads;

create policy "portal_staff_dm_threads_insert_staff_lead_peer"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_staff_or_lead_messenger()
    and (
      participant_a = (select auth.uid())
      or participant_b = (select auth.uid())
    )
    and public.portal_staff_profile_exists_by_id(
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
    and (
      public.portal_staff_profile_is_office_dm_target(
        case
          when participant_a = (select auth.uid()) then participant_b
          else participant_a
        end
      )
      or public.portal_staff_profile_is_staff_lead_cross_peer(
        case
          when participant_a = (select auth.uid()) then participant_b
          else participant_a
        end
      )
    )
  );

drop policy if exists "staff_profiles_select_workers_dm_directory" on public.staff_profiles;

create policy "staff_profiles_select_workers_dm_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    (is_active is null or is_active = true)
    and public.portal_staff_profile_is_staff_side_user(id)
    and public.portal_staff_profile_is_lead_only_messenger()
  );

drop policy if exists "staff_profiles_select_leads_dm_directory" on public.staff_profiles;

create policy "staff_profiles_select_leads_dm_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    lower(coalesce(app_role, '')) = 'lead'
    and (is_active is null or is_active = true)
    and public.portal_staff_profile_is_staff_only_messenger()
  );

commit;
