-- Staff/lead DM: recognise pool workers (empty app_role + swimming/fitness/etc.)
-- and treat manager/admin staff_role as office contacts (like admin/ceo app_role).

begin;

create or replace function public.portal_staff_profile_is_staff_or_lead_messenger()
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
      and sp.is_active is distinct from false
      and (
        lower(coalesce(sp.app_role, '')) in ('staff', 'lead')
        or (
          lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
          and lower(coalesce(sp.staff_role, '')) in (
            'swimming', 'climbing', 'fitness', 'support', 'support_lead'
          )
        )
      )
  );
$$;

comment on function public.portal_staff_profile_is_staff_or_lead_messenger() is
  'True when current user may use staff/lead internal chat (app_role staff/lead or worker staff_role).';

create or replace function public.portal_staff_profile_is_office_dm_target(user_id uuid)
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
    where sp.id = user_id
      and sp.is_active is distinct from false
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
      )
  );
$$;

comment on function public.portal_staff_profile_is_office_dm_target(uuid) is
  'Office DM peer: admin/ceo app_role or manager/admin staff_role.';

drop policy if exists "staff_profiles_select_office_dm_directory" on public.staff_profiles;

create policy "staff_profiles_select_office_dm_directory"
  on public.staff_profiles
  for select
  to authenticated
  using (
    (
      lower(coalesce(app_role, '')) in ('admin', 'ceo')
      or lower(coalesce(staff_role, '')) in ('manager', 'admin')
    )
    and (is_active is null or is_active = true)
    and public.portal_staff_profile_is_staff_or_lead_messenger()
  );

commit;
