-- Call events in the chat: time, type, duration, missed/declined.

begin;

alter table public.communication_messages
  add column if not exists call_id uuid references public.communication_calls(id) on delete set null;

create unique index if not exists communication_messages_call_event_uidx
  on public.communication_messages (call_id)
  where call_id is not null and message_type = 'call' and deleted_at is null;

create or replace function public.communication_format_call_duration(
  p_start timestamptz,
  p_end timestamptz
)
returns text
language plpgsql
immutable
as $$
declare
  v_sec int;
  v_h int;
  v_m int;
  v_s int;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return null;
  end if;
  v_sec := greatest(1, floor(extract(epoch from (p_end - p_start)))::int);
  v_h := v_sec / 3600;
  v_m := (v_sec % 3600) / 60;
  v_s := v_sec % 60;
  if v_h > 0 then
    return v_h::text || ' hr'
      || case when v_m > 0 then ' ' || v_m::text || ' min' else '' end;
  end if;
  if v_m > 0 then
    return v_m::text || ' min'
      || case when v_s > 0 then ' ' || v_s::text || ' sec' else '' end;
  end if;
  return v_s::text || ' sec';
end;
$$;

create or replace function public.communication_call_event_body(p_call_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_call public.communication_calls;
  v_kind text;
  v_dur text;
begin
  select * into v_call from public.communication_calls where id = p_call_id;
  if not found then
    return 'Call';
  end if;
  v_kind := case when v_call.type = 'VIDEO' then 'video call' else 'audio call' end;
  if v_call.status = 'missed' then
    return 'Missed ' || v_kind;
  end if;
  if v_call.status = 'rejected' then
    return 'Declined ' || v_kind;
  end if;
  v_dur := public.communication_format_call_duration(
    v_call.answered_at,
    v_call.ended_at
  );
  if v_call.status = 'ended' and v_dur is not null then
    return case when v_call.type = 'VIDEO' then 'Video call' else 'Audio call' end
      || ' - ' || v_dur;
  end if;
  if v_call.status = 'ended' then
    return 'Missed ' || v_kind;
  end if;
  return case when v_call.type = 'VIDEO' then 'Video call' else 'Audio call' end;
end;
$$;

create or replace function public.communication_sync_call_event(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_call public.communication_calls;
  v_conv public.communication_conversations;
  v_ctx text := 'PERSONAL';
  v_body text;
  v_msg uuid;
begin
  if p_call_id is null then
    return;
  end if;
  select * into v_call from public.communication_calls where id = p_call_id;
  if not found then
    return;
  end if;
  select * into v_conv from public.communication_conversations where id = v_call.conversation_id;
  if not found then
    return;
  end if;
  v_body := public.communication_call_event_body(p_call_id);
  if v_conv.type = 'ADMIN_STAFF' and v_call.initiated_by is distinct from v_conv.employee_id then
    v_ctx := 'ADMINISTRATION';
  end if;
  select m.id into v_msg
  from public.communication_messages m
  where m.call_id = p_call_id
    and m.message_type = 'call'
    and m.deleted_at is null
  limit 1;
  if v_msg is not null then
    update public.communication_messages
      set body = v_body
    where id = v_msg
      and body is distinct from v_body;
    return;
  end if;
  insert into public.communication_messages (
    conversation_id, sender_user_id, sender_context, performed_by_user_id,
    body, message_type, call_id, created_at
  ) values (
    v_call.conversation_id,
    v_call.initiated_by,
    v_ctx,
    v_call.initiated_by,
    v_body,
    'call',
    p_call_id,
    v_call.started_at
  )
  returning id into v_msg;
  insert into public.communication_message_reads (message_id, user_id)
  values (v_msg, v_call.initiated_by)
  on conflict do nothing;
end;
$$;

revoke all on function public.communication_format_call_duration(timestamptz, timestamptz) from public;
revoke all on function public.communication_call_event_body(uuid) from public;
revoke all on function public.communication_sync_call_event(uuid) from public;
grant execute on function public.communication_format_call_duration(timestamptz, timestamptz) to authenticated;
grant execute on function public.communication_call_event_body(uuid) to authenticated;
grant execute on function public.communication_sync_call_event(uuid) to authenticated;

create or replace function public.communication_start_call(
  p_conversation_id uuid,
  p_type text
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
  v_type text := upper(coalesce(p_type, 'AUDIO'));
  v_id uuid;
begin
  if not public.communication_can_access_conversation(p_conversation_id) then
    raise exception 'not allowed';
  end if;
  if v_type not in ('AUDIO', 'VIDEO') then
    raise exception 'invalid type';
  end if;
  select * into v_conv from public.communication_conversations where id = p_conversation_id;
  if v_conv.type = 'GROUP' then
    select * into v_grp from public.communication_groups where id = v_conv.group_id;
    if v_grp.status = 'CLOSED' then
      raise exception 'group closed';
    end if;
  end if;

  update public.communication_calls
    set status = 'missed', ended_at = now()
  where conversation_id = p_conversation_id
    and status = 'calling'
    and ended_at is null;

  perform public.communication_sync_call_event(c.id)
  from public.communication_calls c
  where c.conversation_id = p_conversation_id
    and c.status = 'missed';

  insert into public.communication_calls (conversation_id, type, initiated_by)
  values (p_conversation_id, v_type, v_uid)
  returning id into v_id;

  insert into public.communication_call_participants (call_id, user_id)
  values (v_id, v_uid)
  on conflict (call_id, user_id) do update
    set left_at = null, joined_at = now();

  perform public.communication_audit_write(
    'start_call',
    p_conversation_id,
    v_conv.group_id,
    v_conv.employee_id,
    jsonb_build_object('call_id', v_id, 'type', v_type)
  );

  insert into public.communication_presence (user_id, status, last_seen_at)
  values (v_uid, 'in_call', now())
  on conflict (user_id) do update
    set status = 'in_call', last_seen_at = now();

  perform public.communication_sync_call_event(v_id);

  return jsonb_build_object('call_id', v_id, 'type', v_type, 'status', 'calling');
end;
$$;

create or replace function public.communication_call_respond(p_call_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_call public.communication_calls;
  v_act text := lower(trim(coalesce(p_action, '')));
  v_live int := 0;
begin
  select * into v_call from public.communication_calls where id = p_call_id;
  if not found then
    raise exception 'not found';
  end if;
  if not public.communication_can_access_conversation(v_call.conversation_id) then
    raise exception 'not allowed';
  end if;
  if v_act = 'answer' then
    update public.communication_calls
      set status = 'answered', answered_at = coalesce(answered_at, now())
    where id = p_call_id and status in ('calling', 'answered');
    insert into public.communication_call_participants (call_id, user_id)
    values (p_call_id, v_uid)
    on conflict (call_id, user_id) do update
      set left_at = null, joined_at = now();
  elsif v_act = 'reject' then
    update public.communication_calls
      set status = 'rejected', ended_at = now()
    where id = p_call_id and status = 'calling';
  elsif v_act = 'leave' then
    update public.communication_call_participants
      set left_at = now()
    where call_id = p_call_id and user_id = v_uid and left_at is null;
    select count(*)::int into v_live
    from public.communication_call_participants
    where call_id = p_call_id and left_at is null;
    if v_live < 2 then
      update public.communication_calls
        set status = case when status = 'calling' then 'missed' else 'ended' end,
            ended_at = now()
      where id = p_call_id and ended_at is null;
    end if;
  elsif v_act = 'end' then
    update public.communication_calls
      set status = case when status = 'calling' then 'missed' else 'ended' end,
          ended_at = now()
    where id = p_call_id and ended_at is null;
    update public.communication_call_participants
      set left_at = now()
    where call_id = p_call_id and left_at is null;
  else
    raise exception 'invalid action';
  end if;
  insert into public.communication_presence (user_id, status, last_seen_at)
  values (v_uid, case when v_act = 'answer' then 'in_call' else 'available' end, now())
  on conflict (user_id) do update
    set status = excluded.status, last_seen_at = now();
  perform public.communication_sync_call_event(p_call_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Past calls into the thread. Mark them read so old history does not inflate badges.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select c.id
    from public.communication_calls c
    where not exists (
      select 1 from public.communication_messages m
      where m.call_id = c.id and m.message_type = 'call' and m.deleted_at is null
    )
    order by c.started_at
  loop
    perform public.communication_sync_call_event(v_id);
  end loop;

  insert into public.communication_message_reads (message_id, user_id)
  select m.id, sp.id
  from public.communication_messages m
  cross join public.staff_profiles sp
  where m.message_type = 'call'
    and m.call_id is not null
    and coalesce(sp.is_active, true)
  on conflict do nothing;
end $$;

commit;
