-- COMMS receipts: sent -> delivered -> read.
-- Delivered = recipient's portal/COMMS is open (not office opening the staff thread).
-- ADMIN_STAFF outbound (ADMIN -> worker): only the worker's delivery/read counts.

begin;

create table if not exists public.communication_message_deliveries (
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  user_id uuid not null references public.staff_profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists communication_message_deliveries_user_idx
  on public.communication_message_deliveries (user_id, delivered_at desc);

alter table public.communication_message_deliveries enable row level security;

grant select on public.communication_message_deliveries to authenticated;

drop policy if exists communication_message_deliveries_select on public.communication_message_deliveries;
create policy communication_message_deliveries_select
  on public.communication_message_deliveries
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

alter table public.communication_message_deliveries replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_message_deliveries'
    ) then
      alter publication supabase_realtime add table public.communication_message_deliveries;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communication_message_reads'
    ) then
      alter publication supabase_realtime add table public.communication_message_reads;
    end if;
  end if;
end $$;

create or replace function public.communication_mark_delivered(p_conversation_id uuid default null)
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
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not authenticated';
  end if;
  insert into public.communication_message_deliveries (message_id, user_id)
  select m.id, v_uid
  from public.communication_messages m
  join public.communication_conversations c on c.id = m.conversation_id
  where m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and m.created_at > (timezone('utc', now()) - interval '21 days')
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and (
      (c.type = 'ADMIN_STAFF' and c.employee_id = v_uid)
      or (c.type = 'PEER' and (c.peer_a = v_uid or c.peer_b = v_uid))
      or (c.type = 'GROUP' and public.communication_group_is_member(c.group_id, v_uid))
    )
    and not exists (
      select 1 from public.communication_message_deliveries d
      where d.message_id = m.id and d.user_id = v_uid
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.communication_mark_delivered(uuid) from public;
grant execute on function public.communication_mark_delivered(uuid) to authenticated;

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
  insert into public.communication_message_deliveries (message_id, user_id)
  select m.id, v_uid
  from public.communication_messages m
  join public.communication_conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and (
      (c.type = 'ADMIN_STAFF' and c.employee_id = v_uid)
      or (c.type = 'PEER' and (c.peer_a = v_uid or c.peer_b = v_uid))
      or (c.type = 'GROUP' and public.communication_group_is_member(c.group_id, v_uid))
    )
    and not exists (
      select 1 from public.communication_message_deliveries d
      where d.message_id = m.id and d.user_id = v_uid
    );
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
  v_office boolean := public.communication_can_act_as_administration();
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
        when m.sender_context = 'ADMINISTRATION' and v_office
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
      case
        when c.type = 'ADMIN_STAFF' and m.sender_context = 'ADMINISTRATION' then exists (
          select 1 from public.communication_message_deliveries d
          where d.message_id = m.id and d.user_id = c.employee_id
        )
        else exists (
          select 1 from public.communication_message_deliveries d
          where d.message_id = m.id and d.user_id is distinct from m.performed_by_user_id
        )
      end as delivered,
      case
        when c.type = 'ADMIN_STAFF' and m.sender_context = 'ADMINISTRATION' then exists (
          select 1 from public.communication_message_reads r
          where r.message_id = m.id and r.user_id = c.employee_id
        )
        else exists (
          select 1 from public.communication_message_reads r
          where r.message_id = m.id and r.user_id is distinct from m.performed_by_user_id
        )
      end as delivered_read,
      (
        select count(*)::int from public.communication_message_reads r
        where r.message_id = m.id
      ) as read_count
    from public.communication_messages m
    join public.communication_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.deleted_at is null
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('messages', v_out);
end;
$$;

comment on function public.communication_mark_delivered(uuid) is
  'Marks inbound messages delivered for the signed-in worker (portal/COMMS open).';
comment on function public.communication_list_messages(uuid, timestamptz, integer) is
  'Thread messages with sent/delivered/read. ADMIN->staff receipts count only the worker.';

commit;
