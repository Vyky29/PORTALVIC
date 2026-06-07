-- Reliable draft delete for staff/lead (storage + row) and admin delete for any achievement photo.

begin;

create or replace function public.portal_delete_achievement_draft(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.portal_participant_achievement_photos%rowtype;
  v_storage_deleted int := 0;
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
  if v_row.staff_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'not_draft';
  end if;

  delete from storage.objects
  where bucket_id = 'participant-achievements'
    and name = v_row.storage_path;
  get diagnostics v_storage_deleted = row_count;

  delete from public.portal_participant_achievement_photos
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'storage_deleted', v_storage_deleted > 0
  );
end;
$$;

revoke all on function public.portal_delete_achievement_draft(uuid) from public;
grant execute on function public.portal_delete_achievement_draft(uuid) to authenticated;

comment on function public.portal_delete_achievement_draft(uuid) is
  'Staff/lead/admin/CEO: delete own draft achievement photo (storage object + row).';

create or replace function public.portal_admin_delete_achievement_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.portal_participant_achievement_photos%rowtype;
  v_storage_deleted int := 0;
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

  if coalesce(trim(v_row.storage_path), '') <> '' then
    delete from storage.objects
    where bucket_id = 'participant-achievements'
      and name = v_row.storage_path;
    get diagnostics v_storage_deleted = row_count;
  end if;

  delete from public.portal_participant_achievement_photos
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'storage_deleted', v_storage_deleted > 0
  );
end;
$$;

revoke all on function public.portal_admin_delete_achievement_photo(uuid) from public;
grant execute on function public.portal_admin_delete_achievement_photo(uuid) to authenticated;

comment on function public.portal_admin_delete_achievement_photo(uuid) is
  'Admin/CEO: delete any achievement photo (draft, attached, or archived) and its storage object.';

commit;
