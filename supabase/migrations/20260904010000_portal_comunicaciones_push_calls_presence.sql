-- Communications: web push, group-call participants, presence snapshot.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before applying the trigger (see local-vault apply script).

begin;

create table if not exists public.communication_call_participants (
  call_id uuid not null references public.communication_calls(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists communication_call_participants_live_idx
  on public.communication_call_participants (call_id)
  where left_at is null;

alter table public.communication_call_participants enable row level security;
grant select on public.communication_call_participants to authenticated;

drop policy if exists communication_call_participants_select on public.communication_call_participants;
create policy communication_call_participants_select
  on public.communication_call_participants
  for select
  to authenticated
  using (
    exists (
      select 1 from public.communication_calls c
      where c.id = call_id
        and public.communication_can_access_conversation(c.conversation_id)
    )
  );

alter table public.communication_call_participants replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_call_participants'
    ) then
      alter publication supabase_realtime add table public.communication_call_participants;
    end if;
  end if;
end $$;

create table if not exists public.portal_webpush_communications_sent (
  source_table text not null,
  source_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

comment on table public.portal_webpush_communications_sent is
  'Dedupe ledger for portal-push-dispatch-communications.';

alter table public.portal_webpush_communications_sent enable row level security;
grant select, insert on public.portal_webpush_communications_sent to service_role;

create or replace function public.communication_administration_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select coalesce(array_agg(sp.id), '{}'::uuid[])
  from public.staff_profiles sp
  where coalesce(sp.is_active, true)
    and (
      public.communication_profile_is_office_admin(sp.id)
      or public.communication_profile_is_ceo(sp.id)
    );
$$;

revoke all on function public.communication_administration_user_ids() from public;
grant execute on function public.communication_administration_user_ids() to authenticated;
grant execute on function public.communication_administration_user_ids() to service_role;

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
  v_mem public.communication_group_members;
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
    else
      if v_sender is not distinct from v_conv.employee_id then
        v_ids := v_admins;
      else
        v_ids := array[v_conv.employee_id];
      end if;
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
    else
      v_ids := array[v_conv.employee_id] || v_admins;
    end if;

  elsif v_table = 'communication_group_members' then
    select * into v_mem
    from public.communication_group_members
    where group_id = p_id;
    -- p_id here is not enough (composite key). Handled in the Edge Function from the row.
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

create or replace function public.communication_presence_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin text := 'offline';
  v_people jsonb := '{}'::jsonb;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return jsonb_build_object('administration', 'offline', 'people', '{}'::jsonb);
  end if;

  select case
    when bool_or(p.status = 'in_call') then 'in_call'
    when bool_or(p.status in ('available', 'away')) then 'available'
    else 'offline'
  end
  into v_admin
  from public.communication_presence p
  where p.last_seen_at > now() - interval '70 seconds'
    and p.user_id = any (public.communication_administration_user_ids());

  if public.communication_can_act_as_administration() then
    select coalesce(jsonb_object_agg(sp.id::text, jsonb_build_object(
      'status', case
        when p.last_seen_at is null or p.last_seen_at <= now() - interval '70 seconds' then 'offline'
        else p.status
      end
    )), '{}'::jsonb)
    into v_people
    from public.staff_profiles sp
    left join public.communication_presence p on p.user_id = sp.id
    where coalesce(sp.is_active, true)
      and not public.communication_profile_is_office_admin(sp.id);
  else
    select coalesce(jsonb_object_agg(m.user_id::text, jsonb_build_object(
      'status', case
        when p.last_seen_at is null or p.last_seen_at <= now() - interval '70 seconds' then 'offline'
        else p.status
      end
    )), '{}'::jsonb)
    into v_people
    from public.communication_group_members m
    left join public.communication_presence p on p.user_id = m.user_id
    where m.removed_at is null
      and exists (
        select 1 from public.communication_group_members me
        where me.group_id = m.group_id
          and me.user_id = v_uid
          and me.removed_at is null
      );
  end if;

  return jsonb_build_object(
    'administration', coalesce(v_admin, 'offline'),
    'people', coalesce(v_people, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.communication_presence_snapshot() from public;
grant execute on function public.communication_presence_snapshot() to authenticated;

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
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.communication_call_peers(p_call_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_call public.communication_calls;
  v_out jsonb;
begin
  select * into v_call from public.communication_calls where id = p_call_id;
  if not found then
    raise exception 'not found';
  end if;
  if not public.communication_can_access_conversation(v_call.conversation_id) then
    raise exception 'not allowed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'display_name', public.communication_staff_label(p.user_id),
    'joined_at', p.joined_at
  ) order by p.joined_at), '[]'::jsonb)
  into v_out
  from public.communication_call_participants p
  where p.call_id = p_call_id and p.left_at is null;
  return jsonb_build_object(
    'call_id', v_call.id,
    'type', v_call.type,
    'status', v_call.status,
    'conversation_id', v_call.conversation_id,
    'initiated_by', v_call.initiated_by,
    'peers', coalesce(v_out, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.communication_call_peers(uuid) from public;
grant execute on function public.communication_call_peers(uuid) to authenticated;

drop trigger if exists "portal-comms-message-push" on public.communication_messages;
create trigger "portal-comms-message-push"
after insert on public.communication_messages
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-communications',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

drop trigger if exists "portal-comms-call-push" on public.communication_calls;
create trigger "portal-comms-call-push"
after insert on public.communication_calls
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-communications',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

drop trigger if exists "portal-comms-group-member-push" on public.communication_group_members;
create trigger "portal-comms-group-member-push"
after insert on public.communication_group_members
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-communications',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
