-- Who should hear an incoming COMMS call (dashboard overlay + in-app poll).
-- Office calling a worker rings only that worker. Worker calling ADMIN rings office/CEOs.

begin;

create or replace function public.communication_ringing_for_me()
returns table (
  id uuid,
  type text,
  status text,
  conversation_id uuid,
  initiated_by uuid,
  started_at timestamptz,
  ring_mode text,
  ring_title text,
  ring_subtitle text
)
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_office boolean;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return;
  end if;
  v_office := public.communication_can_act_as_administration();

  return query
  select
    c.id,
    c.type,
    c.status,
    c.conversation_id,
    c.initiated_by,
    c.started_at,
    case
      when conv.type = 'ADMIN_STAFF' and conv.employee_id = v_uid then 'personal'
      when conv.type = 'ADMIN_STAFF' then 'administration'
      else 'personal'
    end as ring_mode,
    case
      when upper(c.type) = 'VIDEO' then 'Incoming video call'
      else 'Incoming call'
    end as ring_title,
    case
      when conv.type = 'ADMIN_STAFF' and conv.employee_id = v_uid then 'ADMIN is calling you'
      when conv.type = 'ADMIN_STAFF' then 'Worker calling ADMIN'
      when conv.type = 'GROUP' then 'Group call'
      else 'Communications'
    end as ring_subtitle
  from public.communication_calls c
  join public.communication_conversations conv on conv.id = c.conversation_id
  where c.status = 'calling'
    and c.initiated_by is distinct from v_uid
    and (
      (conv.type = 'ADMIN_STAFF' and conv.employee_id = v_uid)
      or (
        v_office
        and conv.type = 'ADMIN_STAFF'
        and c.initiated_by = conv.employee_id
      )
      or (
        conv.type = 'PEER'
        and (conv.peer_a = v_uid or conv.peer_b = v_uid)
      )
      or (
        conv.type = 'GROUP'
        and public.communication_group_is_member(conv.group_id, v_uid)
      )
    )
  order by c.started_at desc
  limit 8;
end;
$$;

revoke all on function public.communication_ringing_for_me() from public;
grant execute on function public.communication_ringing_for_me() to authenticated;

comment on function public.communication_ringing_for_me() is
  'Ringing COMMS calls that should alert the signed-in staff member.';

commit;
