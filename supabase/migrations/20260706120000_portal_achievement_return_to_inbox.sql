-- Admin: move a wrongly assigned lead-inbox draft back to Inbox (unassigned).

begin;

create or replace function public.portal_admin_return_achievement_photo_to_inbox(
  p_photo_id uuid,
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
  v_new_path text;
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
  if v_row.status <> 'draft' then
    raise exception 'not_draft';
  end if;
  if v_row.client_id = '_inbox' then
    raise exception 'already_inbox';
  end if;

  v_cid := public.portal_normalize_achievement_client_id(v_row.client_id);
  if v_cid = '' or v_cid = '_inbox' then
    raise exception 'invalid_client';
  end if;

  v_new_path := regexp_replace(v_row.storage_path, '/' || v_cid || '/', '/_inbox/');
  if v_new_path = v_row.storage_path then
    raise exception 'path_update_failed';
  end if;

  if coalesce(trim(p_new_storage_path), '') <> '' and trim(p_new_storage_path) <> v_new_path then
    raise exception 'storage_path_mismatch';
  end if;

  update public.portal_participant_achievement_photos
  set
    client_id = '_inbox',
    client_name = 'Inbox (unassigned)',
    storage_path = v_new_path
  where id = p_photo_id;

  return jsonb_build_object(
    'id', p_photo_id,
    'client_id', '_inbox',
    'client_name', 'Inbox (unassigned)',
    'storage_path', v_new_path,
    'old_storage_path', v_row.storage_path,
    'old_client_id', v_row.client_id,
    'old_client_name', v_row.client_name
  );
end;
$$;

revoke all on function public.portal_admin_return_achievement_photo_to_inbox(uuid, text) from public;
grant execute on function public.portal_admin_return_achievement_photo_to_inbox(uuid, text) to authenticated;

comment on function public.portal_admin_return_achievement_photo_to_inbox(uuid, text) is
  'Admin/CEO: return a draft achievement photo from a participant folder to lead inbox. Browser must move storage file before calling.';

commit;
