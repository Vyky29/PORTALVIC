-- Tighten director detection: Javier Marquez (staff) must not match executive trio / director DM rules.
-- Only Javier Arranz (Palan) and named CEOs Raul / Victor qualify.

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
        lower(coalesce(sp.username, '')) in ('raul', 'victor')
        or lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('raul', 'victor')
        or lower(coalesce(sp.username, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%arranz%'
        or (
          lower(coalesce(sp.username, '')) in ('javi', 'javier')
          and (
            lower(coalesce(sp.full_name, '')) like '%palan%'
            or lower(coalesce(sp.full_name, '')) like '%arranz%'
            or lower(coalesce(sp.username, '')) like '%palan%'
          )
        )
        or (
          lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('javi', 'javier')
          and (
            lower(coalesce(sp.full_name, '')) like '%palan%'
            or lower(coalesce(sp.full_name, '')) like '%arranz%'
          )
        )
      )
  );
$$;

create or replace function public.portal_profile_is_executive_trio_member()
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
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and lower(coalesce(sp.app_role, '')) not in ('staff', 'lead')
      and (
        public.portal_profile_staff_key(sp.id) in ('raul', 'victor')
        or lower(coalesce(sp.username, '')) in ('raul', 'victor')
        or lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('raul', 'victor')
        or (
          lower(coalesce(sp.app_role, '')) = 'ceo'
          and lower(coalesce(sp.username, '')) in ('raul', 'victor', 'javi')
        )
        or lower(coalesce(sp.username, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%palan%'
        or lower(coalesce(sp.full_name, '')) like '%arranz%'
        or (
          lower(coalesce(sp.username, '')) in ('javi', 'javier')
          and (
            lower(coalesce(sp.full_name, '')) like '%palan%'
            or lower(coalesce(sp.full_name, '')) like '%arranz%'
            or lower(coalesce(sp.username, '')) like '%palan%'
          )
        )
        or (
          lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('javi', 'javier')
          and (
            lower(coalesce(sp.full_name, '')) like '%palan%'
            or lower(coalesce(sp.full_name, '')) like '%arranz%'
          )
        )
      )
  );
$$;

commit;
