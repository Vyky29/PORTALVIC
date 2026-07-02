-- Match legacy staff_profiles rows when template username differs (e.g. Luliya vs aida/lulia).

create or replace function public.portal_staff_profile_usernames_for_template(p_username text, p_email text)
returns text[]
language sql
immutable
as $$
  select case lower(trim(coalesce(p_username, '')))
    when 'luliya' then array['luliya', 'lulia', 'aida']
    when 'lulia' then array['luliya', 'lulia', 'aida']
    when 'aida' then array['luliya', 'lulia', 'aida']
    when 'javi' then array['javi', 'javier']
    when 'javier' then array['javi', 'javier']
    when 'youssef' then array['youssef', 'yousef', 'yusef']
    else array[lower(trim(coalesce(p_username, '')))]
  end
  || case
    when lower(coalesce(p_email, '')) = 'stf021@staff.import.pending' then array['luliya', 'lulia', 'aida']
    when lower(coalesce(p_email, '')) = 'stf010@staff.import.pending' then array['javier', 'javi']
    when lower(coalesce(p_email, '')) = 'stf005@staff.import.pending' then array['youssef', 'yousef', 'yusef']
    else array[]::text[]
  end;
$$;

create or replace function public.portal_get_session_staff_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tpl public.portal_auth_profile_templates%rowtype;
  v_row public.staff_profiles%rowtype;
  v_names text[];
begin
  if v_uid is null then
    return null;
  end if;

  select sp.* into v_row
  from public.staff_profiles sp
  where sp.id = v_uid;

  if found then
    return public.portal_staff_profile_row_to_json(v_row);
  end if;

  select lower(au.email) into v_email
  from auth.users au
  where au.id = v_uid;

  if v_email is null then
    return null;
  end if;

  select t.* into v_tpl
  from public.portal_auth_profile_templates t
  where t.email_lower = v_email;

  if not found then
    return null;
  end if;

  v_names := (
    select array_agg(distinct n)
    from unnest(public.portal_staff_profile_usernames_for_template(v_tpl.username, v_email)) as n
    where n is not null and trim(n) <> ''
  );

  select sp.* into v_row
  from public.staff_profiles sp
  where lower(trim(sp.username)) = any (v_names)
  limit 1;

  if found then
    if v_row.id is distinct from v_uid then
      begin
        update public.staff_profiles
          set id = v_uid
        where id = v_row.id;
        select sp.* into v_row
        from public.staff_profiles sp
        where sp.id = v_uid;
      exception
        when foreign_key_violation then
          null;
      end;
    end if;
    return public.portal_staff_profile_row_to_json(v_row);
  end if;

  begin
    insert into public.staff_profiles
      (id, username, full_name, app_role, staff_role, dashboard_route, is_active)
    values
      (v_uid, v_tpl.username, v_tpl.full_name, v_tpl.app_role, v_tpl.staff_role, v_tpl.dashboard_route, true)
    on conflict (id) do update set
      username = excluded.username,
      full_name = excluded.full_name,
      app_role = excluded.app_role,
      staff_role = excluded.staff_role,
      dashboard_route = excluded.dashboard_route,
      is_active = true
    returning * into v_row;
  exception
    when unique_violation then
      select sp.* into v_row
      from public.staff_profiles sp
      where lower(trim(sp.username)) = any (v_names)
      limit 1;
      if not found then
        return null;
      end if;
  end;

  return public.portal_staff_profile_row_to_json(v_row);
end;
$$;

comment on function public.portal_get_session_staff_profile() is
  'Returns staff_profiles for auth.uid(); matches allowlisted Auth email, username aliases, relinks legacy rows, or auto-creates.';

revoke all on function public.portal_get_session_staff_profile() from public;
grant execute on function public.portal_get_session_staff_profile() to authenticated;
