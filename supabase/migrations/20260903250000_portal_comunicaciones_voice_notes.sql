-- Voice notes in Communications + keep message_type in sync with send_message.

begin;

alter table public.communication_messages
  drop constraint if exists communication_messages_message_type_check;
alter table public.communication_messages
  drop constraint if exists communication_messages_content_chk;

alter table public.communication_messages
  add constraint communication_messages_message_type_check
  check (message_type in ('text', 'image', 'file', 'audio', 'system', 'call'));

alter table public.communication_messages
  add constraint communication_messages_content_chk
  check (
    deleted_at is not null
    or message_type in ('system', 'call')
    or (message_type = 'text' and body is not null and char_length(trim(body)) > 0)
    or (
      message_type in ('image', 'file', 'audio')
      and storage_path is not null
      and char_length(trim(storage_path)) > 0
    )
  );

create or replace function public.communication_send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_sender_context text default 'PERSONAL',
  p_message_type text default 'text',
  p_storage_path text default null,
  p_mime_type text default null,
  p_file_name text default null,
  p_file_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv public.communication_conversations;
  v_grp public.communication_groups;
  v_ctx text := upper(coalesce(nullif(trim(p_sender_context), ''), 'PERSONAL'));
  v_type text := lower(coalesce(nullif(trim(p_message_type), ''), 'text'));
  v_id uuid;
  v_sender uuid;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not authenticated';
  end if;
  if not public.communication_can_access_conversation(p_conversation_id) then
    raise exception 'not allowed';
  end if;
  select * into v_conv from public.communication_conversations where id = p_conversation_id;
  if not found then
    raise exception 'not found';
  end if;

  if v_conv.type = 'GROUP' then
    select * into v_grp from public.communication_groups where id = v_conv.group_id;
    if v_grp.status = 'CLOSED' then
      raise exception 'group closed';
    end if;
    if not public.communication_can_act_as_administration()
       and not public.communication_group_is_member(v_conv.group_id, v_uid) then
      raise exception 'not allowed';
    end if;
    v_ctx := 'PERSONAL';
    v_sender := v_uid;
  else
    if public.communication_can_act_as_administration() then
      v_ctx := 'ADMINISTRATION';
      v_sender := v_uid;
    else
      if v_conv.employee_id is distinct from v_uid then
        raise exception 'not allowed';
      end if;
      v_ctx := 'PERSONAL';
      v_sender := v_uid;
    end if;
  end if;

  if v_type not in ('text', 'image', 'file', 'audio') then
    raise exception 'invalid type';
  end if;

  insert into public.communication_messages (
    conversation_id, sender_user_id, sender_context, performed_by_user_id,
    body, message_type, storage_path, mime_type, file_name, file_size
  ) values (
    p_conversation_id, v_sender, v_ctx, v_uid,
    nullif(trim(p_body), ''), v_type, nullif(trim(p_storage_path), ''),
    nullif(trim(p_mime_type), ''), nullif(trim(p_file_name), ''), p_file_size
  )
  returning id into v_id;

  insert into public.communication_message_reads (message_id, user_id)
  values (v_id, v_uid)
  on conflict do nothing;

  perform public.communication_audit_write(
    'send_message',
    p_conversation_id,
    v_conv.group_id,
    v_conv.employee_id,
    jsonb_build_object('message_id', v_id, 'context', v_ctx, 'type', v_type)
  );

  return jsonb_build_object('id', v_id);
end;
$$;

update storage.buckets
set
  file_size_limit = 15728640,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/aac',
    'audio/wav',
    'audio/x-m4a',
    'audio/x-wav'
  ]::text[]
where id = 'communication-files';

commit;
