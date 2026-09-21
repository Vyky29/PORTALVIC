-- COMMS: staff list photos from /portal/staff_photos/{key}.png
-- CEO My account peers include office admins (Sevitha); Sevitha sees CEOs in personal mode.

begin;

create or replace function public.communication_avatar_url(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to public, auth
set row_security to off
as $$
  with base as (
    select
      nullif(trim(sp.avatar_url), '') as profile_url,
      nullif(trim(u.raw_user_meta_data->>'avatar_url'), '') as meta_url,
      public.portal_profile_staff_key(sp.id) as staff_key
    from public.staff_profiles sp
    left join auth.users u on u.id = sp.id
    where sp.id = p_user_id
  ),
  mapped as (
    select
      profile_url,
      meta_url,
      case coalesce(staff_key, '')
        when 'aida' then 'luliya'
        when 'lulia' then 'luliya'
        when 'palankas' then 'javi'
        when 'javiarranz' then 'javi'
        when 'javiarranzescorial' then 'javi'
        when 'palankasarranz' then 'javi'
        when 'palankasarranzescorial' then 'javi'
        when 'michelleemma' then 'michelle'
        when 'michelleemmacaleb' then 'michelle'
        when 'johnkyeifram' then 'john'
        when 'youssefmoustafa' then 'youssef'
        when 'javiermarquez' then 'javier'
        when 'carlesherrero' then 'carlos'
        when 'carlosherrero' then 'carlos'
        when 'godswayyatofo' then 'godsway'
        when 'andresborrego' then 'andres'
        when 'robertoreali' then 'roberto'
        when 'bertatrapero' then 'berta'
        when 'auroragarcia' then 'aurora'
        when 'alexstone' then 'alex'
        else staff_key
      end as photo_key
    from base
  )
  select coalesce(
    profile_url,
    meta_url,
    case
      when photo_key is not null and photo_key <> '' then
        '/portal/staff_photos/' || photo_key || '.png'
      else null
    end
  )
  from mapped
$$;

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
  v_me_ok boolean;
  v_other_ok boolean;
begin
  if v_uid is null or not public.communication_is_active_staff() then
    raise exception 'not allowed';
  end if;
  v_me_ok := public.communication_is_ceo() or public.communication_is_office_admin();
  if not v_me_ok then
    raise exception 'not allowed';
  end if;
  if p_other_id is null or p_other_id = v_uid then
    raise exception 'not allowed';
  end if;
  v_other_ok := public.communication_profile_is_ceo(p_other_id)
    or public.communication_profile_is_office_admin(p_other_id);
  if not v_other_ok then
    raise exception 'not allowed';
  end if;
  -- Peer threads are CEO <-> CEO or CEO <-> office admin (Sevitha), not office-only pairs.
  if not public.communication_is_ceo()
     and not public.communication_profile_is_ceo(p_other_id) then
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
  v_office boolean := public.communication_is_office_admin();
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

    -- CEOs see other CEOs + office admins (Sevitha). Office admins see CEOs.
    if v_ceo or v_office then
      for v_row in
        select sp.id, public.communication_staff_label(sp.id) as display_name,
               public.communication_avatar_url(sp.id) as avatar_url
        from public.staff_profiles sp
        where coalesce(sp.is_active, true)
          and sp.id is distinct from v_uid
          and (
            (
              v_ceo
              and (
                public.communication_profile_is_ceo(sp.id)
                or public.communication_profile_is_office_admin(sp.id)
              )
            )
            or (
              not v_ceo
              and public.communication_profile_is_ceo(sp.id)
            )
          )
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

comment on function public.communication_avatar_url(uuid) is
  'Staff avatar: profile/meta URL, else static /portal/staff_photos/{key}.png.';
comment on function public.communication_ensure_ceo_peer_thread(uuid) is
  'Ensure PEER thread between CEOs, or CEO and office admin (Sevitha).';

commit;
