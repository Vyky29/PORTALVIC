-- Staff avatars: store under auth uid folder (matches browser upload path).

begin;

create or replace function public.portal_staff_avatar_path_is_own(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    auth.uid() is not null
    and (storage.foldername(p_name))[1] = auth.uid()::text;
$$;

comment on function public.portal_staff_avatar_path_is_own(text) is
  'True when storage object path first folder is auth.uid() (self-service avatar upload).';

drop policy if exists portal_staff_avatars_select on storage.objects;
create policy portal_staff_avatars_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.portal_staff_can_upload_own_avatar()
    and public.portal_staff_avatar_path_is_own(name)
  );

commit;
