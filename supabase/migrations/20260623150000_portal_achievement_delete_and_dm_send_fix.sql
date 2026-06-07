-- Fix achievement photo delete (no direct storage.objects DELETE) and DM send RLS.

begin;

-- Admin/CEO may delete any object in participant-achievements via Storage API.
drop policy if exists portal_achievement_storage_delete_admin on storage.objects;
create policy portal_achievement_storage_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

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

-- Reliable DM send: participants + portal admin operators (shared inbox).
create or replace function public.portal_staff_dm_insert_message(
  p_thread_id uuid,
  p_body text,
  p_message_type text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_type text := lower(trim(coalesce(p_message_type, 'text')));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_body = '' then
    raise exception 'empty_body';
  end if;
  if char_length(v_body) > 8000 then
    raise exception 'body_too_long';
  end if;
  if v_type not in ('text', 'voice') then
    v_type := 'text';
  end if;

  if not (
    exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = p_thread_id
        and (t.participant_a = v_uid or t.participant_b = v_uid)
    )
    or public.portal_staff_profile_is_portal_admin()
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.portal_staff_dm_messages (thread_id, author_id, body, message_type)
  values (p_thread_id, v_uid, v_body, v_type)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.portal_staff_dm_insert_message(uuid, text, text) from public;
grant execute on function public.portal_staff_dm_insert_message(uuid, text, text) to authenticated;

comment on function public.portal_staff_dm_insert_message(uuid, text, text) is
  'Insert DM message as current user when thread participant or portal admin operator.';

grant select, insert on public.portal_staff_dm_messages to authenticated;

drop policy if exists "portal_staff_dm_messages_insert_portal_admin" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_portal_admin"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_portal_admin()
    and exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = thread_id
    )
  );

commit;
