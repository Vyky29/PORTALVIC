-- Live location RLS: allow staff profiles with empty app_role (default staff) to upsert.

begin;

create or replace function public.portal_staff_can_share_live_location()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and coalesce(sp.is_active, true)
      and lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
  );
$$;

revoke all on function public.portal_staff_can_share_live_location() from public;
grant execute on function public.portal_staff_can_share_live_location() to authenticated;

comment on function public.portal_staff_can_share_live_location() is
  'Staff/lead (or blank app_role treated as staff) may share GPS on the live map.';

drop policy if exists portal_staff_live_locations_insert_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_insert_own
  on public.portal_staff_live_locations
  for insert
  to authenticated
  with check (
    staff_user_id = auth.uid()
    and public.portal_staff_can_share_live_location()
  );

drop policy if exists portal_staff_live_locations_update_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_update_own
  on public.portal_staff_live_locations
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and public.portal_staff_can_share_live_location()
  )
  with check (staff_user_id = auth.uid());

commit;
