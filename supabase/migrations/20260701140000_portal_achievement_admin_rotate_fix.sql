-- Admin rotate: RPC for row dimensions + storage/table update policies (missing on some remotes).

begin;

drop policy if exists portal_achievement_photos_update_admin on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_update_admin
  on public.portal_participant_achievement_photos
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

grant update on table public.portal_participant_achievement_photos to authenticated;

drop policy if exists portal_achievement_storage_update_admin on storage.objects;
create policy portal_achievement_storage_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  )
  with check (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

create or replace function public.portal_admin_update_achievement_photo_dimensions(
  p_photo_id uuid,
  p_width int,
  p_height int,
  p_byte_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.portal_participant_achievement_photos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'forbidden';
  end if;
  if p_width is null or p_height is null or p_width < 1 or p_height < 1 then
    raise exception 'invalid_dimensions';
  end if;

  select *
  into v_row
  from public.portal_participant_achievement_photos
  where id = p_photo_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  update public.portal_participant_achievement_photos
  set
    width = p_width,
    height = p_height,
    byte_size = coalesce(p_byte_size, byte_size)
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'width', p_width,
    'height', p_height,
    'byte_size', coalesce(p_byte_size, v_row.byte_size)
  );
end;
$$;

revoke all on function public.portal_admin_update_achievement_photo_dimensions(uuid, int, int, bigint) from public;
grant execute on function public.portal_admin_update_achievement_photo_dimensions(uuid, int, int, bigint) to authenticated;

comment on function public.portal_admin_update_achievement_photo_dimensions(uuid, int, int, bigint) is
  'Admin/CEO: update achievement photo width/height/byte_size after in-browser rotate.';

commit;
