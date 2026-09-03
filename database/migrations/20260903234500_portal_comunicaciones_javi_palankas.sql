-- Comunicaciones: CEO is Javi Palankas (username Javi), never instructor Javier.
-- Also restore portal_normalize_staff_key so "Javi" is javi (not avi).

begin;

create or replace function public.portal_normalize_staff_key(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(trim(raw), ''),
        'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaaeeeeiiiioooooouuuuncAAAAAAEEEEIIIIOOOOOOUUUUNC'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

comment on function public.portal_normalize_staff_key(text) is
  'Lowercase alphanumeric staff key; accents stripped. Lowercases before removing non-alphanumerics.';

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

commit;
