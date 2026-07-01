-- Lead inbox drafts: staff reassign own inbox photo to participant after browser storage move (feedback attach).

begin;

create or replace function public.portal_staff_reassign_inbox_achievement_draft(
  p_photo_id uuid,
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
  v_row public.portal_participant_achievement_photos%rowtype;
  v_cid text;
  v_cname text;
  v_new_path text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_can_use_achievement_photos() then
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

  v_new_path := trim(coalesce(p_new_storage_path, ''));
  if v_new_path = '' then
    raise exception 'missing_storage_path';
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
  if v_row.staff_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_row.client_id <> '_inbox' then
    raise exception 'not_inbox';
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

revoke all on function public.portal_staff_reassign_inbox_achievement_draft(uuid, text, text, text) from public;
grant execute on function public.portal_staff_reassign_inbox_achievement_draft(uuid, text, text, text) to authenticated;

comment on function public.portal_staff_reassign_inbox_achievement_draft(uuid, text, text, text) is
  'Staff/lead: assign own inbox draft to participant folder after browser Storage move (feedback attach).';

commit;
