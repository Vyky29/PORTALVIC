-- Fast unread total for portal COMMS badges.
-- The original communication_unread_count() called communication_can_access_conversation()
-- once per message, which timed out after call-event backfill so dashboards stayed at 0
-- while the inbox (per-thread counts) still showed numbers.

begin;

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
  v_admin boolean;
  v_n int := 0;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return 0;
  end if;
  v_admin := public.communication_can_act_as_administration();

  select count(*)::int into v_n
  from public.communication_messages m
  where m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and m.conversation_id in (
      select c.id
      from public.communication_conversations c
      where
        (c.type = 'ADMIN_STAFF' and (c.employee_id = v_uid or v_admin))
        or (c.type = 'PEER' and (c.peer_a = v_uid or c.peer_b = v_uid))
        or (
          c.type = 'GROUP'
          and (
            v_admin
            or exists (
              select 1
              from public.communication_group_members gm
              where gm.group_id = c.group_id
                and gm.user_id = v_uid
                and gm.removed_at is null
            )
          )
        )
    )
    and not exists (
      select 1
      from public.communication_message_reads r
      where r.message_id = m.id and r.user_id = v_uid
    );

  return coalesce(v_n, 0);
end;
$$;

revoke all on function public.communication_unread_count() from public;
grant execute on function public.communication_unread_count() to authenticated;

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

  v_unread := public.communication_unread_count();

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

commit;
