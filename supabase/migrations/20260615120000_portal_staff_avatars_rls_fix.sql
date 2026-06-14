-- Staff avatar upload: widen RLS (admin/CEO, pool workers) and restrict to own folder.
-- Fixes: "new row violates row-level security policy" on topbar photo change.

begin;

create or replace function public.portal_staff_can_upload_own_avatar()
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
    where sp.id = auth.uid()
      and sp.is_active is distinct from false
      and (
        public.portal_staff_profile_is_admin_or_ceo()
        or lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
        or (
          lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
          and lower(coalesce(sp.staff_role, '')) in (
            'swimming', 'climbing', 'fitness', 'support', 'support_lead', 'lead'
          )
        )
      )
  );
$$;

comment on function public.portal_staff_can_upload_own_avatar() is
  'Active staff, lead, pool workers, admin, or CEO — may upload own staff-avatars/{username}/avatar.*.';

revoke all on function public.portal_staff_can_upload_own_avatar() from public;
grant execute on function public.portal_staff_can_upload_own_avatar() to authenticated;

create or replace function public.portal_staff_avatar_path_is_own(p_name text)
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
    where sp.id = auth.uid()
      and lower(trim(coalesce(sp.username, ''))) = lower(trim(coalesce((storage.foldername(p_name))[1], '')))
  );
$$;

comment on function public.portal_staff_avatar_path_is_own(text) is
  'True when storage object path first folder matches staff_profiles.username for auth.uid().';

revoke all on function public.portal_staff_avatar_path_is_own(text) from public;
grant execute on function public.portal_staff_avatar_path_is_own(text) to authenticated;

drop policy if exists portal_staff_avatars_insert on storage.objects;
create policy portal_staff_avatars_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and public.portal_staff_can_upload_own_avatar()
    and public.portal_staff_avatar_path_is_own(name)
  );

drop policy if exists portal_staff_avatars_update on storage.objects;
create policy portal_staff_avatars_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.portal_staff_can_upload_own_avatar()
    and public.portal_staff_avatar_path_is_own(name)
  )
  with check (
    bucket_id = 'staff-avatars'
    and public.portal_staff_can_upload_own_avatar()
    and public.portal_staff_avatar_path_is_own(name)
  );

drop policy if exists portal_staff_avatars_delete on storage.objects;
create policy portal_staff_avatars_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.portal_staff_can_upload_own_avatar()
    and public.portal_staff_avatar_path_is_own(name)
  );

commit;
