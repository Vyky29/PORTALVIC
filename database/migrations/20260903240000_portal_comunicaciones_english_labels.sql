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

commit;
