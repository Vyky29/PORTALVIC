-- Delete your own Communications message for everyone (soft delete).

begin;

create or replace function public.communication_delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_msg public.communication_messages;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not authenticated';
  end if;
  select * into v_msg from public.communication_messages where id = p_message_id;
  if not found or v_msg.deleted_at is not null then
    raise exception 'not found';
  end if;
  if v_msg.message_type in ('system', 'call') then
    raise exception 'not allowed';
  end if;
  if v_msg.performed_by_user_id is distinct from v_uid then
    raise exception 'not allowed';
  end if;
  if not public.communication_can_access_conversation(v_msg.conversation_id) then
    raise exception 'not allowed';
  end if;
  update public.communication_messages
  set deleted_at = now()
  where id = p_message_id
    and deleted_at is null;
  return jsonb_build_object('ok', true, 'id', p_message_id);
end;
$$;

revoke all on function public.communication_delete_message(uuid) from public;
grant execute on function public.communication_delete_message(uuid) to authenticated;

comment on function public.communication_delete_message(uuid) is
  'Soft-deletes a message the signed-in person sent. It leaves the chat for everyone.';

commit;
