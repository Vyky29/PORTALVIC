-- Split unread totals so My account vs ADMIN can notify independently.
-- Office/CEO users landing on ADMIN never saw personal (My account) mail
-- until they switched tabs.

begin;

create or replace function public.communication_unread_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security to off
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin boolean;
  v_personal int := 0;
  v_admin_n int := 0;
  v_total int := 0;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    return jsonb_build_object('personal', 0, 'administration', 0, 'total', 0);
  end if;
  v_admin := public.communication_can_act_as_administration();

  select count(*)::int into v_personal
  from public.communication_messages m
  where m.deleted_at is null
    and m.performed_by_user_id is distinct from v_uid
    and m.conversation_id in (
      select c.id
      from public.communication_conversations c
      where
        (c.type = 'ADMIN_STAFF' and c.employee_id = v_uid)
        or (c.type = 'PEER' and (c.peer_a = v_uid or c.peer_b = v_uid))
        or (
          c.type = 'GROUP'
          and exists (
            select 1
            from public.communication_group_members gm
            where gm.group_id = c.group_id
              and gm.user_id = v_uid
              and gm.removed_at is null
          )
        )
    )
    and not exists (
      select 1 from public.communication_message_reads r
      where r.message_id = m.id and r.user_id = v_uid
    );

  if v_admin then
    select count(*)::int into v_admin_n
    from public.communication_messages m
    where m.deleted_at is null
      and m.performed_by_user_id is distinct from v_uid
      and m.conversation_id in (
        select c.id
        from public.communication_conversations c
        where
          (c.type = 'ADMIN_STAFF' and c.employee_id is distinct from v_uid)
          or c.type = 'GROUP'
      )
      and not exists (
        select 1 from public.communication_message_reads r
        where r.message_id = m.id and r.user_id = v_uid
      );
  end if;

  v_total := public.communication_unread_count();

  return jsonb_build_object(
    'personal', coalesce(v_personal, 0),
    'administration', coalesce(v_admin_n, 0),
    'total', coalesce(v_total, 0)
  );
end;
$$;

revoke all on function public.communication_unread_counts() from public;
grant execute on function public.communication_unread_counts() to authenticated;

commit;
