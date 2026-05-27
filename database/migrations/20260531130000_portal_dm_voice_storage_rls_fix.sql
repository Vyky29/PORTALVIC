-- Fix voice upload RLS: admins/operators may upload to any existing DM thread (shared inbox),
-- not only threads where they are participant_a / participant_b.

begin;

create or replace function public.portal_dm_user_can_access_audio_object(obj_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  parts text[];
  kind text;
  ref_id uuid;
begin
  parts := storage.foldername(obj_name);
  if parts is null or coalesce(array_length(parts, 1), 0) < 2 then
    return false;
  end if;
  kind := lower(parts[1]);
  begin
    ref_id := parts[2]::uuid;
  exception
    when others then
      return false;
  end;

  if kind = 'thread' then
    return exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = ref_id
    )
    and (
      public.portal_staff_dm_user_in_thread(ref_id)
      or public.portal_staff_profile_is_exec_operator()
    );
  end if;

  if kind = 'group' then
    return exists (
      select 1
      from public.portal_ceo_group g
      where g.id = ref_id
    )
    and (
      public.portal_staff_profile_is_exec_operator()
      or public.portal_staff_profile_is_admin_or_ceo()
    );
  end if;

  return false;
end;
$$;

comment on function public.portal_dm_user_can_access_audio_object(text) is
  'Storage RLS helper for bucket portal-dm-audio paths thread/{id}/… or group/{id}/…';

revoke all on function public.portal_dm_user_can_access_audio_object(text) from public;
grant execute on function public.portal_dm_user_can_access_audio_object(text) to authenticated;

drop policy if exists portal_dm_audio_select on storage.objects;
create policy portal_dm_audio_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-dm-audio'
    and public.portal_dm_user_can_access_audio_object(name)
  );

drop policy if exists portal_dm_audio_insert on storage.objects;
create policy portal_dm_audio_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portal-dm-audio'
    and public.portal_dm_user_can_access_audio_object(name)
  );

commit;
