-- Lead inbox: photos captured without a participant (client_id _inbox); admin assigns to client folder.

begin;

comment on column public.portal_participant_achievement_photos.client_id is
  'Participant key, or reserved _inbox for lead photos pending admin assignment.';

-- Do not mix inbox photos into participant shared draft pools / feedback attach.
create or replace function public.portal_list_participant_achievement_drafts(
  p_client_id text,
  p_session_date date,
  p_portal_session_key text default null
)
returns table (
  id uuid,
  storage_path text,
  created_at timestamptz,
  width int,
  height int,
  staff_user_id uuid,
  staff_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.storage_path,
    p.created_at,
    p.width,
    p.height,
    p.staff_user_id,
    p.staff_display_name
  from public.portal_participant_achievement_photos p
  where p.status = 'draft'
    and p.session_date = p_session_date
    and p.client_id = public.portal_normalize_achievement_client_id(p_client_id)
    and p.client_id <> '_inbox'
    and public.portal_staff_can_use_achievement_photos()
  order by p.created_at asc;
$$;

comment on function public.portal_list_participant_achievement_drafts(text, date, text) is
  'Draft achievement photos for client+day (excludes lead inbox _inbox).';

create or replace function public.portal_admin_assign_achievement_photo(
  p_photo_id uuid,
  p_client_id text,
  p_client_name text
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
  v_moved int;
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

  update storage.objects
  set name = v_new_path
  where bucket_id = 'participant-achievements'
    and name = v_row.storage_path;
  get diagnostics v_moved = row_count;

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
    'storage_moved', v_moved > 0
  );
end;
$$;

revoke all on function public.portal_admin_assign_achievement_photo(uuid, text, text) from public;
grant execute on function public.portal_admin_assign_achievement_photo(uuid, text, text) to authenticated;

comment on function public.portal_admin_assign_achievement_photo(uuid, text, text) is
  'Admin/CEO: move a draft lead-inbox photo to a participant folder (storage + row).';

commit;
