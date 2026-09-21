-- Comunicaciones: internal office messenger (Admin/CEO <-> staff + ad-hoc groups).
-- Reuses staff_profiles.id (auth.users). No second employee directory.
-- Staff cannot open or create staff<->staff DMs. Writes go through SECURITY DEFINER RPCs.

begin;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.communication_profile_is_office_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = p_user_id
      and coalesce(sp.is_active, true)
      and lower(coalesce(sp.app_role, '')) is distinct from 'ceo'
      and lower(coalesce(sp.username, '')) not in ('javi', 'javier', 'victor', 'raul', 'palankas')
      and lower(coalesce(sp.full_name, '')) not like '%palankas%'
      and public.portal_profile_staff_key(sp.id) not in ('victor', 'javi', 'palankas', 'raul')
      and (
        lower(coalesce(sp.app_role, '')) = 'admin'
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
        or public.portal_profile_staff_key(sp.id) in ('sevitha', 'info')
      )
  );
$$;

create or replace function public.communication_profile_is_ceo(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = p_user_id
      and coalesce(sp.is_active, true)
      -- Instructor Javier (username Javier / Javier Marquez) is never CEO.
      -- CEO Javi is Palankas (username Javi).
      and lower(coalesce(sp.username, '')) is distinct from 'javier'
      and lower(coalesce(sp.full_name, '')) not like 'javier marquez%'
      and (
        lower(coalesce(sp.app_role, '')) = 'ceo'
        or lower(coalesce(sp.username, '')) in ('javi', 'victor', 'raul', 'palankas')
        or lower(coalesce(sp.full_name, '')) like '%palankas%'
        or public.portal_profile_staff_key(sp.id) in ('victor', 'javi', 'palankas', 'raul')
      )
      and public.portal_profile_staff_key(sp.id) not in ('sevitha', 'info', 'javier')
  );
$$;

create or replace function public.communication_is_office_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select public.communication_profile_is_office_admin((select auth.uid()));
$$;

create or replace function public.communication_is_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select public.communication_profile_is_ceo((select auth.uid()));
$$;

create or replace function public.communication_can_act_as_administration()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select public.communication_is_office_admin() or public.communication_is_ceo();
$$;

create or replace function public.communication_can_manage_groups()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select public.communication_can_act_as_administration();
$$;

create or replace function public.communication_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
  );
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_profiles'
      and column_name = 'avatar_url'
  ) then
    alter table public.staff_profiles add column avatar_url text;
  end if;
end $$;

create or replace function public.communication_avatar_url(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to public, auth
set row_security to off
as $$
  select coalesce(
    nullif(trim(sp.avatar_url), ''),
    nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
  )
  from public.staff_profiles sp
  left join auth.users u on u.id = sp.id
  where sp.id = p_user_id
$$;

revoke all on function public.communication_avatar_url(uuid) from public;
grant execute on function public.communication_avatar_url(uuid) to authenticated;

create or replace function public.communication_staff_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select case
    when lower(coalesce(sp.username, '')) = 'javi'
      or lower(coalesce(sp.full_name, '')) like '%palankas%'
    then 'Javi Palankas'
    else coalesce(nullif(trim(sp.full_name), ''), sp.username, 'Staff')
  end
  from public.staff_profiles sp
  where sp.id = p_user_id
$$;

revoke all on function public.communication_staff_label(uuid) from public;
grant execute on function public.communication_staff_label(uuid) to authenticated;

comment on function public.communication_is_office_admin() is
  'Ops Administration identity: app_role admin, staff_role manager/admin, or Sevitha.';
comment on function public.communication_is_ceo() is
  'CEO trio: Victor, Javi Palankas, Raul (not instructor Javier).';

revoke all on function public.communication_profile_is_office_admin(uuid) from public;
revoke all on function public.communication_profile_is_ceo(uuid) from public;
revoke all on function public.communication_is_office_admin() from public;
revoke all on function public.communication_is_ceo() from public;
revoke all on function public.communication_can_act_as_administration() from public;
revoke all on function public.communication_can_manage_groups() from public;
revoke all on function public.communication_is_active_staff() from public;

grant execute on function public.communication_profile_is_office_admin(uuid) to authenticated;
grant execute on function public.communication_profile_is_ceo(uuid) to authenticated;
grant execute on function public.communication_is_office_admin() to authenticated;
grant execute on function public.communication_is_ceo() to authenticated;
grant execute on function public.communication_can_act_as_administration() to authenticated;
grant execute on function public.communication_can_manage_groups() to authenticated;
grant execute on function public.communication_is_active_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ADMIN_STAFF', 'GROUP')),
  employee_id uuid references public.staff_profiles(id) on delete cascade,
  group_id uuid,
  created_at timestamptz not null default now(),
  constraint communication_conversations_admin_staff_employee
    check (
      (type = 'ADMIN_STAFF' and employee_id is not null and group_id is null)
      or (type = 'GROUP' and employee_id is null and group_id is not null)
    )
);

create unique index if not exists communication_conversations_admin_staff_uidx
  on public.communication_conversations (employee_id)
  where type = 'ADMIN_STAFF';

create unique index if not exists communication_conversations_group_uidx
  on public.communication_conversations (group_id)
  where type = 'GROUP';

create table if not exists public.communication_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  created_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.staff_profiles(id),
  closed_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_conversations_group_fk'
  ) then
    alter table public.communication_conversations
      add constraint communication_conversations_group_fk
      foreign key (group_id) references public.communication_groups(id) on delete cascade;
  end if;
end $$;

create table if not exists public.communication_group_members (
  group_id uuid not null references public.communication_groups(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(id) on delete cascade,
  added_by uuid references public.staff_profiles(id),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, user_id)
);

create index if not exists communication_group_members_user_idx
  on public.communication_group_members (user_id)
  where removed_at is null;

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.staff_profiles(id),
  sender_context text not null check (sender_context in ('PERSONAL', 'ADMINISTRATION')),
  performed_by_user_id uuid not null references public.staff_profiles(id),
  body text,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'file', 'audio', 'system', 'call')),
  storage_path text,
  mime_type text,
  file_name text,
  file_size integer,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint communication_messages_content_chk check (
    deleted_at is not null
    or message_type in ('system', 'call')
    or (message_type = 'text' and body is not null and char_length(trim(body)) > 0)
    or (
      message_type in ('image', 'file', 'audio')
      and storage_path is not null
      and char_length(trim(storage_path)) > 0
    )
  )
);

create index if not exists communication_messages_conv_created_idx
  on public.communication_messages (conversation_id, created_at desc);

create table if not exists public.communication_message_reads (
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.communication_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  type text not null check (type in ('AUDIO', 'VIDEO')),
  initiated_by uuid not null references public.staff_profiles(id),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  status text not null default 'calling'
    check (status in ('calling', 'answered', 'missed', 'rejected', 'ended'))
);

create index if not exists communication_calls_conv_idx
  on public.communication_calls (conversation_id, started_at desc);

create table if not exists public.communication_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.communication_calls(id) on delete cascade,
  sender_id uuid not null references public.staff_profiles(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists communication_call_signals_call_idx
  on public.communication_call_signals (call_id, created_at);

create table if not exists public.communication_presence (
  user_id uuid primary key references public.staff_profiles(id) on delete cascade,
  status text not null default 'available' check (status in ('available', 'away', 'in_call', 'offline')),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.communication_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.staff_profiles(id),
  action text not null,
  conversation_id uuid,
  group_id uuid,
  target_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists communication_audit_log_created_idx
  on public.communication_audit_log (created_at desc);

comment on table public.communication_conversations is
  'ADMIN_STAFF = one thread per worker with corporate Administracion. GROUP = ad-hoc group.';
comment on table public.communication_audit_log is
  'Append-only administrative audit. No UI updates/deletes.';

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create or replace function public.communication_group_is_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.communication_group_members m
    where m.group_id = p_group_id
      and m.user_id = p_user_id
      and m.removed_at is null
  );
$$;

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

revoke all on function public.communication_group_is_member(uuid, uuid) from public;
revoke all on function public.communication_can_access_conversation(uuid) from public;
grant execute on function public.communication_group_is_member(uuid, uuid) to authenticated;
grant execute on function public.communication_can_access_conversation(uuid) to authenticated;

create or replace function public.communication_audit_write(
  p_action text,
  p_conversation_id uuid default null,
  p_group_id uuid default null,
  p_target_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.communication_audit_log (
    actor_user_id, action, conversation_id, group_id, target_user_id, metadata
  ) values (
    (select auth.uid()), p_action, p_conversation_id, p_group_id, p_target_user_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.communication_audit_write(text, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.communication_audit_write(text, uuid, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.communication_conversations enable row level security;
alter table public.communication_groups enable row level security;
alter table public.communication_group_members enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_message_reads enable row level security;
alter table public.communication_calls enable row level security;
alter table public.communication_call_signals enable row level security;
alter table public.communication_presence enable row level security;
alter table public.communication_audit_log enable row level security;

grant select on public.communication_conversations to authenticated;
grant select on public.communication_groups to authenticated;
grant select on public.communication_group_members to authenticated;
grant select on public.communication_messages to authenticated;
grant select on public.communication_message_reads to authenticated;
grant select on public.communication_calls to authenticated;
grant select on public.communication_call_signals to authenticated;
grant select on public.communication_presence to authenticated;
grant select on public.communication_audit_log to authenticated;

drop policy if exists communication_conversations_select on public.communication_conversations;
create policy communication_conversations_select
  on public.communication_conversations
  for select
  to authenticated
  using (public.communication_can_access_conversation(id));

drop policy if exists communication_groups_select on public.communication_groups;
create policy communication_groups_select
  on public.communication_groups
  for select
  to authenticated
  using (
    public.communication_can_act_as_administration()
    or public.communication_group_is_member(id, (select auth.uid()))
  );

drop policy if exists communication_group_members_select on public.communication_group_members;
create policy communication_group_members_select
  on public.communication_group_members
  for select
  to authenticated
  using (
    public.communication_can_act_as_administration()
    or public.communication_group_is_member(group_id, (select auth.uid()))
  );

drop policy if exists communication_messages_select on public.communication_messages;
create policy communication_messages_select
  on public.communication_messages
  for select
  to authenticated
  using (
    deleted_at is null
    and public.communication_can_access_conversation(conversation_id)
  );

drop policy if exists communication_message_reads_select on public.communication_message_reads;
create policy communication_message_reads_select
  on public.communication_message_reads
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.communication_can_act_as_administration()
    or exists (
      select 1 from public.communication_messages m
      where m.id = message_id
        and public.communication_can_access_conversation(m.conversation_id)
    )
  );

drop policy if exists communication_calls_select on public.communication_calls;
create policy communication_calls_select
  on public.communication_calls
  for select
  to authenticated
  using (public.communication_can_access_conversation(conversation_id));

drop policy if exists communication_call_signals_select on public.communication_call_signals;
create policy communication_call_signals_select
  on public.communication_call_signals
  for select
  to authenticated
  using (
    exists (
      select 1 from public.communication_calls c
      where c.id = call_id
        and public.communication_can_access_conversation(c.conversation_id)
    )
  );

drop policy if exists communication_presence_select on public.communication_presence;
create policy communication_presence_select
  on public.communication_presence
  for select
  to authenticated
  using (public.communication_is_active_staff());

drop policy if exists communication_audit_log_select on public.communication_audit_log;
create policy communication_audit_log_select
  on public.communication_audit_log
  for select
  to authenticated
  using (public.communication_can_act_as_administration());

-- ---------------------------------------------------------------------------
-- Ensure ADMIN_STAFF thread
-- ---------------------------------------------------------------------------

create or replace function public.communication_ensure_admin_staff_thread(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_employee_id is null then
    raise exception 'employee required';
  end if;
  select coalesce(is_active, true) into v_active
  from public.staff_profiles
  where id = p_employee_id;
  if v_active is null then
    raise exception 'unknown employee';
  end if;
  if not v_active then
    raise exception 'employee inactive';
  end if;
  if not public.communication_can_act_as_administration()
     and p_employee_id is distinct from v_uid then
    raise exception 'not allowed';
  end if;
  if public.communication_profile_is_office_admin(p_employee_id)
     and not public.communication_can_act_as_administration() then
    raise exception 'not allowed';
  end if;

  select id into v_id
  from public.communication_conversations
  where type = 'ADMIN_STAFF' and employee_id = p_employee_id;

  if v_id is null then
    insert into public.communication_conversations (type, employee_id)
    values ('ADMIN_STAFF', p_employee_id)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.communication_ensure_admin_staff_thread(uuid) from public;
grant execute on function public.communication_ensure_admin_staff_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap / inbox / unread
-- ---------------------------------------------------------------------------

create or replace function public.communication_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_prof public.staff_profiles;
  v_unread int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select * into v_prof from public.staff_profiles where id = v_uid;
  if not found or not coalesce(v_prof.is_active, true) then
    raise exception 'inactive';
  end if;

  select count(*)::int into v_unread
  from public.communication_messages m
  join public.communication_conversations c on c.id = m.conversation_id
  where m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and public.communication_can_access_conversation(c.id)
    and not exists (
      select 1 from public.communication_message_reads r
      where r.message_id = m.id and r.user_id = v_uid
    );

  return jsonb_build_object(
    'me', jsonb_build_object(
      'id', v_prof.id,
      'full_name', coalesce(nullif(trim(v_prof.full_name), ''), v_prof.username, 'Staff'),
      'username', v_prof.username,
      'avatar_url', public.communication_avatar_url(v_prof.id),
      'app_role', v_prof.app_role,
      'staff_role', v_prof.staff_role,
      'is_office_admin', public.communication_is_office_admin(),
      'is_ceo', public.communication_is_ceo(),
      'can_act_as_administration', public.communication_can_act_as_administration(),
      'can_manage_groups', public.communication_can_manage_groups()
    ),
    'unread_total', v_unread
  );
end;
$$;

revoke all on function public.communication_bootstrap() from public;
grant execute on function public.communication_bootstrap() to authenticated;

create or replace function public.communication_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n int := 0;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return 0;
  end if;
  select count(*)::int into v_n
  from public.communication_messages m
  where m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and public.communication_can_access_conversation(m.conversation_id)
    and not exists (
      select 1 from public.communication_message_reads r
      where r.message_id = m.id and r.user_id = v_uid
    );
  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.communication_unread_count() from public;
grant execute on function public.communication_unread_count() to authenticated;

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
  v_items jsonb := '[]'::jsonb;
  v_admin_thread uuid;
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
      'display_name', 'Administration',
      'avatar_url', null,
      'last', v_last,
      'unread', coalesce(v_unread, 0)
    ));
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
      v_admin
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

revoke all on function public.communication_inbox(text) from public;
grant execute on function public.communication_inbox(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create or replace function public.communication_open_staff_thread(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.communication_can_act_as_administration() then
    raise exception 'not allowed';
  end if;
  v_id := public.communication_ensure_admin_staff_thread(p_employee_id);
  select public.communication_staff_label(p_employee_id)
    into v_name;
  perform public.communication_audit_write(
    'open_conversation',
    v_id,
    null,
    p_employee_id,
    jsonb_build_object('employee_name', v_name)
  );
  return jsonb_build_object('conversation_id', v_id, 'employee_id', p_employee_id, 'display_name', v_name);
end;
$$;

revoke all on function public.communication_open_staff_thread(uuid) from public;
grant execute on function public.communication_open_staff_thread(uuid) to authenticated;

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
        when m.sender_context = 'ADMINISTRATION' then 'Administration'
        else coalesce(nullif(trim(sp.full_name), ''), sp.username, 'Staff')
      end as sender_display,
      case
        when m.sender_context = 'ADMINISTRATION'
          then coalesce(nullif(trim(actor.full_name), ''), actor.username)
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
    join public.staff_profiles sp on sp.id = m.sender_user_id
    join public.staff_profiles actor on actor.id = m.performed_by_user_id
    where m.conversation_id = p_conversation_id
      and m.deleted_at is null
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('messages', v_out);
end;
$$;

revoke all on function public.communication_list_messages(uuid, timestamptz, integer) from public;
grant execute on function public.communication_list_messages(uuid, timestamptz, integer) to authenticated;

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
    -- ADMIN_STAFF
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

revoke all on function public.communication_send_message(uuid, text, text, text, text, text, text, integer) from public;
grant execute on function public.communication_send_message(uuid, text, text, text, text, text, text, integer) to authenticated;

create or replace function public.communication_mark_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n int := 0;
begin
  if not public.communication_can_access_conversation(p_conversation_id) then
    raise exception 'not allowed';
  end if;
  insert into public.communication_message_reads (message_id, user_id)
  select m.id, v_uid
  from public.communication_messages m
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and not exists (
      select 1 from public.communication_message_reads r
      where r.message_id = m.id and r.user_id = v_uid
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.communication_mark_read(uuid) from public;
grant execute on function public.communication_mark_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

create or replace function public.communication_create_group(
  p_name text,
  p_description text default null,
  p_member_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gid uuid;
  v_cid uuid;
  v_mid uuid;
begin
  if not public.communication_can_manage_groups() then
    raise exception 'not allowed';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'name required';
  end if;
  insert into public.communication_groups (name, description, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), v_uid)
  returning id into v_gid;

  insert into public.communication_conversations (type, group_id)
  values ('GROUP', v_gid)
  returning id into v_cid;

  insert into public.communication_group_members (group_id, user_id, added_by)
  values (v_gid, v_uid, v_uid)
  on conflict do nothing;

  if p_member_ids is not null then
    foreach v_mid in array p_member_ids loop
      if v_mid is null then
        continue;
      end if;
      if exists (
        select 1 from public.staff_profiles sp
        where sp.id = v_mid and coalesce(sp.is_active, true)
      ) then
        insert into public.communication_group_members (group_id, user_id, added_by)
        values (v_gid, v_mid, v_uid)
        on conflict (group_id, user_id) do update
          set removed_at = null, added_by = excluded.added_by, added_at = now();
      end if;
    end loop;
  end if;

  perform public.communication_audit_write(
    'create_group',
    v_cid,
    v_gid,
    null,
    jsonb_build_object('name', trim(p_name), 'members', p_member_ids)
  );

  return jsonb_build_object('group_id', v_gid, 'conversation_id', v_cid);
end;
$$;

revoke all on function public.communication_create_group(text, text, uuid[]) from public;
grant execute on function public.communication_create_group(text, text, uuid[]) to authenticated;

create or replace function public.communication_set_group_members(
  p_group_id uuid,
  p_add_ids uuid[] default '{}',
  p_remove_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_mid uuid;
  v_status text;
begin
  if not public.communication_can_manage_groups() then
    raise exception 'not allowed';
  end if;
  select status into v_status from public.communication_groups where id = p_group_id;
  if v_status is null then
    raise exception 'not found';
  end if;
  if p_add_ids is not null then
    foreach v_mid in array p_add_ids loop
      if v_mid is null then continue; end if;
      insert into public.communication_group_members (group_id, user_id, added_by)
      values (p_group_id, v_mid, v_uid)
      on conflict (group_id, user_id) do update
        set removed_at = null, added_by = excluded.added_by, added_at = now();
      perform public.communication_audit_write(
        'add_group_member', null, p_group_id, v_mid, '{}'::jsonb
      );
    end loop;
  end if;
  if p_remove_ids is not null then
    foreach v_mid in array p_remove_ids loop
      if v_mid is null then continue; end if;
      update public.communication_group_members
        set removed_at = now()
      where group_id = p_group_id and user_id = v_mid and removed_at is null;
      perform public.communication_audit_write(
        'remove_group_member', null, p_group_id, v_mid, '{}'::jsonb
      );
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.communication_set_group_members(uuid, uuid[], uuid[]) from public;
grant execute on function public.communication_set_group_members(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.communication_close_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.communication_can_manage_groups() then
    raise exception 'not allowed';
  end if;
  update public.communication_groups
    set status = 'CLOSED', closed_by = v_uid, closed_at = now()
  where id = p_group_id and status = 'ACTIVE';
  if not found then
    raise exception 'not found or already closed';
  end if;
  perform public.communication_audit_write('close_group', null, p_group_id, null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.communication_close_group(uuid) from public;
grant execute on function public.communication_close_group(uuid) to authenticated;

create or replace function public.communication_group_members_list(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_out jsonb;
  v_cid uuid;
begin
  select id into v_cid from public.communication_conversations
  where type = 'GROUP' and group_id = p_group_id;
  if v_cid is null or not public.communication_can_access_conversation(v_cid) then
    raise exception 'not allowed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sp.id,
    'full_name', coalesce(nullif(trim(sp.full_name), ''), sp.username, 'Staff'),
    'avatar_url', public.communication_avatar_url(sp.id),
    'added_at', m.added_at
  ) order by lower(coalesce(sp.full_name, sp.username, ''))), '[]'::jsonb)
  into v_out
  from public.communication_group_members m
  join public.staff_profiles sp on sp.id = m.user_id
  where m.group_id = p_group_id and m.removed_at is null;
  return jsonb_build_object('members', v_out);
end;
$$;

revoke all on function public.communication_group_members_list(uuid) from public;
grant execute on function public.communication_group_members_list(uuid) to authenticated;

create or replace function public.communication_staff_picker()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_out jsonb;
begin
  if not public.communication_can_manage_groups() then
    raise exception 'not allowed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sp.id,
    'full_name', public.communication_staff_label(sp.id),
    'username', sp.username,
    'avatar_url', public.communication_avatar_url(sp.id),
    'app_role', sp.app_role
  ) order by lower(coalesce(sp.full_name, sp.username, ''))), '[]'::jsonb)
  into v_out
  from public.staff_profiles sp
  where coalesce(sp.is_active, true);
  return jsonb_build_object('staff', v_out);
end;
$$;

revoke all on function public.communication_staff_picker() from public;
grant execute on function public.communication_staff_picker() to authenticated;

-- ---------------------------------------------------------------------------
-- Search + audit
-- ---------------------------------------------------------------------------

create or replace function public.communication_search(p_q text, p_limit integer default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
  v_lim int := least(greatest(coalesce(p_limit, 40), 1), 80);
  v_people jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_msgs jsonb := '[]'::jsonb;
begin
  if not public.communication_can_act_as_administration() then
    raise exception 'not allowed';
  end if;
  if char_length(v_q) < 2 then
    return jsonb_build_object('people', v_people, 'groups', v_groups, 'messages', v_msgs);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'full_name', x.full_name, 'avatar_url', x.avatar_url
  )), '[]'::jsonb)
  into v_people
  from (
    select sp.id,
           public.communication_staff_label(sp.id) as full_name,
           public.communication_avatar_url(sp.id) as avatar_url
    from public.staff_profiles sp
    where coalesce(sp.is_active, true)
      and (
        lower(coalesce(sp.full_name, '')) like '%' || v_q || '%'
        or lower(coalesce(sp.username, '')) like '%' || v_q || '%'
      )
    order by lower(coalesce(sp.full_name, sp.username, ''))
    limit v_lim
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'name', x.name, 'status', x.status
  )), '[]'::jsonb)
  into v_groups
  from (
    select g.id, g.name, g.status
    from public.communication_groups g
    where lower(g.name) like '%' || v_q || '%'
       or lower(coalesce(g.description, '')) like '%' || v_q || '%'
    order by g.created_at desc
    limit v_lim
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'conversation_id', x.conversation_id,
    'body', x.body,
    'created_at', x.created_at
  )), '[]'::jsonb)
  into v_msgs
  from (
    select m.id, m.conversation_id, left(m.body, 180) as body, m.created_at
    from public.communication_messages m
    where m.deleted_at is null
      and m.body is not null
      and lower(m.body) like '%' || v_q || '%'
    order by m.created_at desc
    limit v_lim
  ) x;

  return jsonb_build_object('people', v_people, 'groups', v_groups, 'messages', v_msgs);
end;
$$;

revoke all on function public.communication_search(text, integer) from public;
grant execute on function public.communication_search(text, integer) to authenticated;

create or replace function public.communication_audit_list(
  p_limit integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_out jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 80), 1), 200);
begin
  if not public.communication_can_act_as_administration() then
    raise exception 'not allowed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'actor_user_id', a.actor_user_id,
    'actor_name', coalesce(nullif(trim(sp.full_name), ''), sp.username),
    'action', a.action,
    'conversation_id', a.conversation_id,
    'group_id', a.group_id,
    'target_user_id', a.target_user_id,
    'metadata', a.metadata,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into v_out
  from (
    select * from public.communication_audit_log
    order by created_at desc
    limit v_lim
  ) a
  join public.staff_profiles sp on sp.id = a.actor_user_id;
  return jsonb_build_object('rows', v_out);
end;
$$;

revoke all on function public.communication_audit_list(integer) from public;
grant execute on function public.communication_audit_list(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Calls + presence
-- ---------------------------------------------------------------------------

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
  else
    -- ADMIN_STAFF only: staff may call Administracion; office may call the worker.
    -- Never staff<->staff (there is no such conversation type).
    null;
  end if;

  update public.communication_calls
    set status = 'missed', ended_at = now()
  where conversation_id = p_conversation_id
    and status = 'calling'
    and ended_at is null;

  insert into public.communication_calls (conversation_id, type, initiated_by)
  values (p_conversation_id, v_type, v_uid)
  returning id into v_id;

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

revoke all on function public.communication_start_call(uuid, text) from public;
grant execute on function public.communication_start_call(uuid, text) to authenticated;

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
      set status = 'answered', answered_at = now()
    where id = p_call_id and status = 'calling';
  elsif v_act = 'reject' then
    update public.communication_calls
      set status = 'rejected', ended_at = now()
    where id = p_call_id and status = 'calling';
  elsif v_act = 'end' then
    update public.communication_calls
      set status = case when status = 'calling' then 'missed' else 'ended' end,
          ended_at = now()
    where id = p_call_id and ended_at is null;
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

revoke all on function public.communication_call_respond(uuid, text) from public;
grant execute on function public.communication_call_respond(uuid, text) to authenticated;

create or replace function public.communication_call_signal(p_call_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_call public.communication_calls;
  v_id uuid;
begin
  select * into v_call from public.communication_calls where id = p_call_id;
  if not found then
    raise exception 'not found';
  end if;
  if not public.communication_can_access_conversation(v_call.conversation_id) then
    raise exception 'not allowed';
  end if;
  if v_call.status in ('ended', 'rejected', 'missed') then
    raise exception 'call closed';
  end if;
  insert into public.communication_call_signals (call_id, sender_id, payload)
  values (p_call_id, v_uid, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.communication_call_signal(uuid, jsonb) from public;
grant execute on function public.communication_call_signal(uuid, jsonb) to authenticated;

create or replace function public.communication_heartbeat(p_status text default 'available')
returns jsonb
language plpgsql
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_st text := lower(coalesce(nullif(trim(p_status), ''), 'available'));
begin
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not authenticated';
  end if;
  if v_st not in ('available', 'away', 'in_call', 'offline') then
    v_st := 'available';
  end if;
  insert into public.communication_presence (user_id, status, last_seen_at)
  values (v_uid, v_st, now())
  on conflict (user_id) do update
    set status = excluded.status, last_seen_at = now();
  return jsonb_build_object('ok', true, 'status', v_st);
end;
$$;

revoke all on function public.communication_heartbeat(text) from public;
grant execute on function public.communication_heartbeat(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.communication_messages replica identity full;
alter table public.communication_calls replica identity full;
alter table public.communication_call_signals replica identity full;
alter table public.communication_message_reads replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_messages'
    ) then
      alter publication supabase_realtime add table public.communication_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_calls'
    ) then
      alter publication supabase_realtime add table public.communication_calls;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_call_signals'
    ) then
      alter publication supabase_realtime add table public.communication_call_signals;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'communication-files',
  'communication-files',
  false,
  15728640,
  array[
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
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists communication_files_select on storage.objects;
create policy communication_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'communication-files'
    and public.communication_can_access_conversation(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists communication_files_insert on storage.objects;
create policy communication_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'communication-files'
    and public.communication_can_access_conversation(((storage.foldername(name))[1])::uuid)
  );

commit;
