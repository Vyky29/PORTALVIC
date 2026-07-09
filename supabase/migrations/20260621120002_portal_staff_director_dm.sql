-- Staff may start DMs with admin/CEO (office) or named directors (Raul, Javier, Victor).
-- Removes staff?lead peer insert; leads keep staff directory via existing policies.

begin;

create or replace function public.portal_staff_profile_is_director_dm_target(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = user_id
      and sp.is_active is distinct from false
      and lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
      and (
        lower(coalesce(sp.username, '')) in ('raul', 'victor', 'javier', 'javi')
        or lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('raul', 'victor', 'javier', 'javi')
        or lower(coalesce(sp.username, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%arranz%'
      )
  );
$$;

comment on function public.portal_staff_profile_is_director_dm_target(uuid) is
  'Named club directors (Raul, Javier/Palan, Victor) — valid DM peer for staff besides admin/CEO.';

revoke all on function public.portal_staff_profile_is_director_dm_target(uuid) from public;
grant execute on function public.portal_staff_profile_is_director_dm_target(uuid) to authenticated;

drop policy if exists "staff_profiles_select_directors_dm_directory" on public.staff_profiles;

create policy "staff_profiles_select_directors_dm_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    (is_active is null or is_active = true)
    and public.portal_staff_profile_is_staff_only_messenger()
    and public.portal_staff_profile_is_director_dm_target(id)
  );

drop policy if exists "portal_staff_dm_threads_insert_staff_lead_peer" on public.portal_staff_dm_threads;

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
      or (
        public.portal_staff_profile_is_staff_only_messenger()
        and public.portal_staff_profile_is_director_dm_target(
          case
            when participant_a = (select auth.uid()) then participant_b
            else participant_a
          end
        )
      )
      or (
        public.portal_staff_profile_is_lead_only_messenger()
        and public.portal_staff_profile_is_staff_lead_cross_peer(
          case
            when participant_a = (select auth.uid()) then participant_b
            else participant_a
          end
        )
      )
    )
  );

commit;
