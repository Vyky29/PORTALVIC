-- Admin: copy an assigned draft achievement photo/video row to another participant folder
-- (browser copies storage first; used for multi-participant inbox assign).

begin;

create or replace function public.portal_admin_duplicate_achievement_draft(
  p_source_photo_id uuid,
  p_client_id text,
  p_client_name text,
  p_new_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.portal_participant_achievement_photos%rowtype;
  v_cid text;
  v_cname text;
  v_path text;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'forbidden';
  end if;

  v_cid := public.portal_normalize_achievement_client_id(p_client_id);
  v_cname := trim(coalesce(p_client_name, ''));
  v_path := trim(coalesce(p_new_storage_path, ''));
  if v_cid = '' or v_cid = '_inbox' then
    raise exception 'invalid_client';
  end if;
  if v_cname = '' then
    raise exception 'invalid_client_name';
  end if;
  if v_path = '' then
    raise exception 'invalid_storage_path';
  end if;

  select *
  into v_src
  from public.portal_participant_achievement_photos
  where id = p_source_photo_id;

  if not found then
    raise exception 'not_found';
  end if;
  if v_src.status <> 'draft' then
    raise exception 'not_draft';
  end if;
  if v_src.client_id = '_inbox' then
    raise exception 'source_still_inbox';
  end if;

  insert into public.portal_participant_achievement_photos (
    staff_user_id,
    staff_display_name,
    client_id,
    client_name,
    session_date,
    portal_session_key,
    storage_path,
    status,
    media_type,
    width,
    height,
    byte_size,
    duration_ms
  )
  values (
    v_src.staff_user_id,
    v_src.staff_display_name,
    v_cid,
    v_cname,
    v_src.session_date,
    v_src.portal_session_key,
    v_path,
    'draft',
    coalesce(v_src.media_type, 'photo'),
    v_src.width,
    v_src.height,
    v_src.byte_size,
    v_src.duration_ms
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'id', v_new_id,
    'source_id', p_source_photo_id,
    'client_id', v_cid,
    'client_name', v_cname,
    'storage_path', v_path
  );
end;
$$;

revoke all on function public.portal_admin_duplicate_achievement_draft(uuid, text, text, text) from public;
grant execute on function public.portal_admin_duplicate_achievement_draft(uuid, text, text, text) to authenticated;

comment on function public.portal_admin_duplicate_achievement_draft(uuid, text, text, text) is
  'Admin/CEO: duplicate a draft achievement row to another participant after browser storage copy.';

commit;
