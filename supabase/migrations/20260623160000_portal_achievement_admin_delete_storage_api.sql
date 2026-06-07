-- Admin delete achievement photos: Storage API in browser + row delete in DB (no storage.objects DELETE in SQL).

begin;

drop policy if exists portal_achievement_storage_delete_admin on storage.objects;
create policy portal_achievement_storage_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

drop policy if exists portal_achievement_photos_delete_admin on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_delete_admin
  on public.portal_participant_achievement_photos
  for delete
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

grant delete on table public.portal_participant_achievement_photos to authenticated;

create or replace function public.portal_admin_delete_achievement_photo(p_photo_id uuid)
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

  select *
  into v_row
  from public.portal_participant_achievement_photos
  where id = p_photo_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  delete from public.portal_participant_achievement_photos
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'storage_path', v_row.storage_path,
    'storage_deleted', false
  );
end;
$$;

create or replace function public.portal_delete_achievement_draft(p_photo_id uuid)
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
  if not public.portal_staff_can_use_achievement_photos() then
    raise exception 'forbidden';
  end if;

  select *
  into v_row
  from public.portal_participant_achievement_photos
  where id = p_photo_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;
  if v_row.staff_user_id <> auth.uid()
     and not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'draft'
     and not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'not_draft';
  end if;

  delete from public.portal_participant_achievement_photos
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'storage_path', v_row.storage_path,
    'storage_deleted', false
  );
end;
$$;

comment on function public.portal_admin_delete_achievement_photo(uuid) is
  'Admin/CEO: delete achievement photo row only; browser removes storage file via Storage API first.';

commit;
