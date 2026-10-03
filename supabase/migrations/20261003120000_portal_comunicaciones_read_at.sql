-- Read receipt time on each message. Same reader as delivered_read:
-- ADMIN -> worker counts only that worker. Other chats count the first other reader.

begin;

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
      case
        when c.type = 'ADMIN_STAFF' and m.sender_context = 'ADMINISTRATION' then (
          select r.read_at
          from public.communication_message_reads r
          where r.message_id = m.id and r.user_id = c.employee_id
          order by r.read_at asc
          limit 1
        )
        else (
          select min(r.read_at)
          from public.communication_message_reads r
          where r.message_id = m.id
            and r.user_id is distinct from m.performed_by_user_id
        )
      end as read_at,
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

comment on function public.communication_list_messages(uuid, timestamptz, integer) is
  'Thread messages with sent/delivered/read and the time it was read. ADMIN->staff receipts count only the worker.';

commit;
