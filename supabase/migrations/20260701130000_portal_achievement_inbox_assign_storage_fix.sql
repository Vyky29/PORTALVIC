-- Inbox assign: move storage via Storage API in browser (SQL UPDATE on storage.objects does not move files).

begin;

drop function if exists public.portal_admin_assign_achievement_photo(uuid, text, text);

create or replace function public.portal_admin_assign_achievement_photo(
  p_photo_id uuid,
  p_client_id text,
  p_client_name text,
  p_new_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.portal_participant_achievement_photos%rowtype;
  v_cid text;
  v_cname text;
  v_new_path text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'forbidden';
  end if;

  v_cid := public.portal_normalize_achievement_client_id(p_client_id);
  v_cname := trim(coalesce(p_client_name, ''));
  if v_cid = '' or v_cid = '_inbox' then
    raise exception 'invalid_client';
  end if;
  if v_cname = '' then
    raise exception 'invalid_client_name';
  end if;

  select *
  into v_row
  from public.portal_participant_achievement_photos
  where id = p_photo_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'not_draft';
  end if;
  if v_row.client_id <> '_inbox' then
    raise exception 'not_inbox';
  end if;

  v_new_path := regexp_replace(v_row.storage_path, '/_inbox/', '/' || v_cid || '/');
  if v_new_path = v_row.storage_path then
    raise exception 'path_update_failed';
  end if;

  if coalesce(trim(p_new_storage_path), '') <> '' and trim(p_new_storage_path) <> v_new_path then
    raise exception 'storage_path_mismatch';
  end if;

  update public.portal_participant_achievement_photos
  set
    client_id = v_cid,
    client_name = v_cname,
    storage_path = v_new_path
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'client_id', v_cid,
    'client_name', v_cname,
    'storage_path', v_new_path,
    'old_storage_path', v_row.storage_path
  );
end;
$$;

comment on function public.portal_admin_assign_achievement_photo(uuid, text, text, text) is
  'Admin/CEO: assign lead inbox draft to participant. Browser must move storage file before calling.';

drop policy if exists portal_achievement_storage_insert_admin on storage.objects;
create policy portal_achievement_storage_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

commit;
