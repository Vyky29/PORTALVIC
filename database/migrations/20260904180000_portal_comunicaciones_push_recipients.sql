-- COMMS web push: office inbox is shared, calls only alert the people who should ring.

begin;

create or replace function public.communication_push_recipient_ids(p_table text, p_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_table text := lower(coalesce(nullif(trim(p_table), ''), ''));
  v_ids uuid[] := '{}'::uuid[];
  v_msg public.communication_messages;
  v_conv public.communication_conversations;
  v_call public.communication_calls;
  v_sender uuid;
  v_admins uuid[];
begin
  if p_id is null then
    return '{}'::uuid[];
  end if;
  v_admins := public.communication_administration_user_ids();

  if v_table = 'communication_messages' then
    select * into v_msg from public.communication_messages where id = p_id;
    if not found or v_msg.deleted_at is not null then
      return '{}'::uuid[];
    end if;
    if v_msg.message_type in ('system', 'call') then
      return '{}'::uuid[];
    end if;
    v_sender := v_msg.performed_by_user_id;
    select * into v_conv from public.communication_conversations where id = v_msg.conversation_id;
    if not found then
      return '{}'::uuid[];
    end if;
    if v_conv.type = 'GROUP' then
      select coalesce(array_agg(m.user_id), '{}'::uuid[]) into v_ids
      from public.communication_group_members m
      where m.group_id = v_conv.group_id
        and m.removed_at is null
        and m.user_id is distinct from v_sender;
    elsif v_conv.type = 'PEER' then
      v_ids := array[v_conv.peer_a, v_conv.peer_b];
    else
      -- ADMIN_STAFF: worker and the rest of office (shared ADMIN inbox).
      v_ids := array[v_conv.employee_id] || coalesce(v_admins, '{}'::uuid[]);
    end if;

  elsif v_table = 'communication_calls' then
    select * into v_call from public.communication_calls where id = p_id;
    if not found then
      return '{}'::uuid[];
    end if;
    v_sender := v_call.initiated_by;
    select * into v_conv from public.communication_conversations where id = v_call.conversation_id;
    if not found then
      return '{}'::uuid[];
    end if;
    if v_conv.type = 'GROUP' then
      select coalesce(array_agg(m.user_id), '{}'::uuid[]) into v_ids
      from public.communication_group_members m
      where m.group_id = v_conv.group_id
        and m.removed_at is null
        and m.user_id is distinct from v_sender;
    elsif v_conv.type = 'PEER' then
      v_ids := array[v_conv.peer_a, v_conv.peer_b];
    elsif v_conv.type = 'ADMIN_STAFF' then
      if v_sender is not distinct from v_conv.employee_id then
        v_ids := coalesce(v_admins, '{}'::uuid[]);
      else
        v_ids := array[v_conv.employee_id];
      end if;
    else
      return '{}'::uuid[];
    end if;
  else
    return '{}'::uuid[];
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(v_ids, '{}'::uuid[])) as x
  where x is not null
    and x is distinct from v_sender;

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;

revoke all on function public.communication_push_recipient_ids(text, uuid) from public;
grant execute on function public.communication_push_recipient_ids(text, uuid) to service_role;

comment on function public.communication_push_recipient_ids(text, uuid) is
  'Who should get a COMMS web push. Office share ADMIN_STAFF mail; calls only ring the callee.';

commit;
