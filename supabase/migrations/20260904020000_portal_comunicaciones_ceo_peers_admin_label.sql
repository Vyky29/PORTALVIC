-- CEO My account: 1:1 with other CEOs + office group (CEOs + Sevitha).
-- Rename the office identity Administration -> ADMIN. Staff still cannot DM staff.

begin;

alter table public.communication_conversations
  add column if not exists peer_a uuid references public.staff_profiles(id) on delete cascade;
alter table public.communication_conversations
  add column if not exists peer_b uuid references public.staff_profiles(id) on delete cascade;

alter table public.communication_conversations
  drop constraint if exists communication_conversations_type_check;
alter table public.communication_conversations
  drop constraint if exists communication_conversations_admin_staff_employee;

alter table public.communication_conversations
  add constraint communication_conversations_type_check
  check (type in ('ADMIN_STAFF', 'GROUP', 'PEER'));

alter table public.communication_conversations
  add constraint communication_conversations_shape_chk
  check (
    (type = 'ADMIN_STAFF' and employee_id is not null and group_id is null and peer_a is null and peer_b is null)
    or (type = 'GROUP' and employee_id is null and group_id is not null and peer_a is null and peer_b is null)
    or (
      type = 'PEER'
      and employee_id is null
      and group_id is null
      and peer_a is not null
      and peer_b is not null
      and peer_a < peer_b
    )
  );

create unique index if not exists communication_conversations_peer_uidx
  on public.communication_conversations (peer_a, peer_b)
  where type = 'PEER';

create or replace function public.communication_ensure_ceo_peer_thread(p_other_id uuid)
returns uuid
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_uid is null or not public.communication_is_ceo() then
    raise exception 'not allowed';
  end if;
  if p_other_id is null or p_other_id = v_uid then
    raise exception 'not allowed';
  end if;
  if not public.communication_profile_is_ceo(p_other_id) then
    raise exception 'not allowed';
  end if;
  v_a := least(v_uid, p_other_id);
  v_b := greatest(v_uid, p_other_id);
  select c.id into v_id
  from public.communication_conversations c
  where c.type = 'PEER' and c.peer_a = v_a and c.peer_b = v_b;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.communication_conversations (type, peer_a, peer_b)
  values ('PEER', v_a, v_b)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.communication_ensure_ceo_peer_thread(uuid) from public;
grant execute on function public.communication_ensure_ceo_peer_thread(uuid) to authenticated;

create or replace function public.communication_can_access_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.communication_conversations;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return false;
  end if;
  select * into v_row from public.communication_conversations where id = p_conversation_id;
  if not found then
    return false;
  end if;
  if v_row.type = 'PEER' then
    return v_uid = v_row.peer_a or v_uid = v_row.peer_b;
  end if;
  if public.communication_can_act_as_administration() then
    return true;
  end if;
  if v_row.type = 'ADMIN_STAFF' then
    return v_row.employee_id = v_uid;
  end if;
  if v_row.type = 'GROUP' then
    return public.communication_group_is_member(v_row.group_id, v_uid);
  end if;
  return false;
end;
$$;

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
  elsif v_conv.type = 'PEER' then
    if v_uid is distinct from v_conv.peer_a and v_uid is distinct from v_conv.peer_b then
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

create or replace function public.communication_list_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lim int := least(greatest(coalesce(p_limit, 40), 1), 80);
  v_out jsonb;
begin
  if not public.communication_can_access_conversation(p_conversation_id) then
    raise exception 'not allowed';
  end if;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb)
  into v_out
  from (
    select
      m.id,
      m.conversation_id,
      m.sender_user_id,
      m.sender_context,
      m.performed_by_user_id,
      case
        when m.sender_context = 'ADMINISTRATION' then 'ADMIN'
        else public.communication_staff_label(m.performed_by_user_id)
      end as sender_display,
      case
        when m.sender_context = 'ADMINISTRATION'
          then public.communication_staff_label(m.performed_by_user_id)
        else null
      end as performed_by_name,
      m.body,
      m.message_type,
      m.storage_path,
      m.mime_type,
      m.file_name,
      m.file_size,
      m.created_at,
      exists (
        select 1 from public.communication_message_reads r
        where r.message_id = m.id and r.user_id is distinct from m.performed_by_user_id
      ) as delivered_read,
      (
        select count(*)::int from public.communication_message_reads r
        where r.message_id = m.id
      ) as read_count
    from public.communication_messages m
    where m.conversation_id = p_conversation_id
      and m.deleted_at is null
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('messages', v_out);
end;
$$;

create or replace function public.communication_inbox(p_mode text default 'auto')
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'auto'));
  v_admin boolean := public.communication_can_act_as_administration();
  v_ceo boolean := public.communication_is_ceo();
  v_items jsonb := '[]'::jsonb;
  v_admin_thread uuid;
  v_peer_thread uuid;
  v_row record;
  v_unread int;
  v_last jsonb;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not authenticated';
  end if;
  if v_mode = 'auto' then
    v_mode := case when v_admin then 'administration' else 'personal' end;
  end if;
  if v_mode = 'administration' and not v_admin then
    v_mode := 'personal';
  end if;

  if v_mode = 'personal' then
    v_admin_thread := public.communication_ensure_admin_staff_thread(v_uid);

    select count(*)::int into v_unread
    from public.communication_messages m
    where m.conversation_id = v_admin_thread
      and m.deleted_at is null
      and m.performed_by_user_id is distinct from v_uid
      and not exists (
        select 1 from public.communication_message_reads r
        where r.message_id = m.id and r.user_id = v_uid
      );

    select jsonb_build_object(
      'body', left(coalesce(m.body, m.file_name, ''), 180),
      'at', m.created_at,
      'type', m.message_type
    )
    into v_last
    from public.communication_messages m
    where m.conversation_id = v_admin_thread and m.deleted_at is null
    order by m.created_at desc
    limit 1;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'admin_staff',
      'conversation_id', v_admin_thread,
      'employee_id', v_uid,
      'display_name', 'ADMIN',
      'avatar_url', null,
      'last', v_last,
      'unread', coalesce(v_unread, 0)
    ));

    if v_ceo then
      for v_row in
        select sp.id, public.communication_staff_label(sp.id) as display_name,
               public.communication_avatar_url(sp.id) as avatar_url
        from public.staff_profiles sp
        where coalesce(sp.is_active, true)
          and sp.id is distinct from v_uid
          and public.communication_profile_is_ceo(sp.id)
        order by lower(public.communication_staff_label(sp.id))
      loop
        v_peer_thread := public.communication_ensure_ceo_peer_thread(v_row.id);
        v_last := null;
        v_unread := 0;

        select count(*)::int into v_unread
        from public.communication_messages m
        where m.conversation_id = v_peer_thread
          and m.deleted_at is null
          and m.performed_by_user_id is distinct from v_uid
          and not exists (
            select 1 from public.communication_message_reads r
            where r.message_id = m.id and r.user_id = v_uid
          );

        select jsonb_build_object(
          'body', left(coalesce(m.body, m.file_name, ''), 180),
          'at', m.created_at,
          'type', m.message_type
        )
        into v_last
        from public.communication_messages m
        where m.conversation_id = v_peer_thread and m.deleted_at is null
        order by m.created_at desc
        limit 1;

        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'kind', 'ceo_peer',
          'conversation_id', v_peer_thread,
          'employee_id', v_row.id,
          'display_name', v_row.display_name,
          'avatar_url', v_row.avatar_url,
          'last', v_last,
          'unread', coalesce(v_unread, 0)
        ));
      end loop;
    end if;
  else
    for v_row in
      select sp.id, sp.full_name, sp.username, public.communication_avatar_url(sp.id) as avatar_url
      from public.staff_profiles sp
      where coalesce(sp.is_active, true)
        and not public.communication_profile_is_office_admin(sp.id)
      order by lower(coalesce(sp.full_name, sp.username, ''))
    loop
      v_admin_thread := public.communication_ensure_admin_staff_thread(v_row.id);
      v_last := null;
      v_unread := 0;

      select count(*)::int into v_unread
      from public.communication_messages m
      where m.conversation_id = v_admin_thread
        and m.deleted_at is null
        and m.performed_by_user_id is distinct from v_uid
        and not exists (
          select 1 from public.communication_message_reads r
          where r.message_id = m.id and r.user_id = v_uid
        );

      select jsonb_build_object(
        'body', left(coalesce(m.body, m.file_name, ''), 180),
        'at', m.created_at,
        'type', m.message_type
      )
      into v_last
      from public.communication_messages m
      where m.conversation_id = v_admin_thread and m.deleted_at is null
      order by m.created_at desc
      limit 1;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind', 'admin_staff',
        'conversation_id', v_admin_thread,
        'employee_id', v_row.id,
        'display_name', public.communication_staff_label(v_row.id),
        'avatar_url', v_row.avatar_url,
        'last', v_last,
        'unread', coalesce(v_unread, 0)
      ));
    end loop;
  end if;

  for v_row in
    select g.id as group_id, g.name, g.description, g.status, c.id as conversation_id, g.created_at, g.closed_at
    from public.communication_groups g
    join public.communication_conversations c on c.type = 'GROUP' and c.group_id = g.id
    where (
      (v_mode = 'administration' and v_admin)
      or public.communication_group_is_member(g.id, v_uid)
    )
    order by g.status asc, g.created_at desc
  loop
    select count(*)::int into v_unread
    from public.communication_messages m
    where m.conversation_id = v_row.conversation_id
      and m.deleted_at is null
      and m.performed_by_user_id is distinct from v_uid
      and not exists (
        select 1 from public.communication_message_reads r
        where r.message_id = m.id and r.user_id = v_uid
      );

    select jsonb_build_object(
      'body', left(coalesce(m.body, m.file_name, ''), 180),
      'at', m.created_at,
      'type', m.message_type
    )
    into v_last
    from public.communication_messages m
    where m.conversation_id = v_row.conversation_id and m.deleted_at is null
    order by m.created_at desc
    limit 1;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'group',
      'conversation_id', v_row.conversation_id,
      'group_id', v_row.group_id,
      'display_name', v_row.name,
      'description', v_row.description,
      'status', v_row.status,
      'last', v_last,
      'unread', coalesce(v_unread, 0),
      'closed_at', v_row.closed_at
    ));
  end loop;

  return jsonb_build_object('mode', v_mode, 'items', v_items);
end;
$$;

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
    elsif v_conv.type = 'PEER' then
      v_ids := array[v_conv.peer_a, v_conv.peer_b];
    else
      v_ids := array[v_conv.employee_id] || v_admins;
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

-- Office group: 3 CEOs + Sevitha (ADMIN). Idempotent.
do $$
declare
  v_gid uuid;
  v_creator uuid;
  v_mid uuid;
begin
  select g.id into v_gid
  from public.communication_groups g
  where g.status = 'ACTIVE'
    and (
      g.name in ('CEOs + ADMIN', 'Office', 'ADMIN + CEOs')
      or coalesce(g.description, '') like '%comms:office-admin-ceos%'
    )
  order by g.created_at
  limit 1;

  select sp.id into v_creator
  from public.staff_profiles sp
  where coalesce(sp.is_active, true)
    and public.communication_profile_is_office_admin(sp.id)
  order by lower(coalesce(sp.username, ''))
  limit 1;
  if v_creator is null then
    select sp.id into v_creator
    from public.staff_profiles sp
    where coalesce(sp.is_active, true)
      and public.communication_profile_is_ceo(sp.id)
    order by lower(coalesce(sp.username, ''))
    limit 1;
  end if;
  if v_creator is null then
    return;
  end if;

  if v_gid is null then
    insert into public.communication_groups (name, description, created_by)
    values (
      'CEOs + ADMIN',
      'Victor, Javi Palankas, Raul, ADMIN and Sevitha. comms:office-admin-ceos',
      v_creator
    )
    returning id into v_gid;
    insert into public.communication_conversations (type, group_id)
    values ('GROUP', v_gid);
  else
    update public.communication_groups
      set name = 'CEOs + ADMIN',
          description = 'Victor, Javi Palankas, Raul, ADMIN and Sevitha. comms:office-admin-ceos'
    where id = v_gid;
  end if;

  for v_mid in
    select sp.id
    from public.staff_profiles sp
    where coalesce(sp.is_active, true)
      and (
        public.communication_profile_is_ceo(sp.id)
        or public.communication_profile_is_office_admin(sp.id)
      )
  loop
    insert into public.communication_group_members (group_id, user_id, added_by)
    values (v_gid, v_mid, v_creator)
    on conflict (group_id, user_id) do update
      set removed_at = null
      where public.communication_group_members.removed_at is not null;
  end loop;
end $$;

commit;
