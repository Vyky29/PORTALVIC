-- Ops-lane DM inserts: stamp [[portal-dm-operator:uuid]] so management inbox shows Victor/Raul, staff still see Admin.

begin;

create or replace function public.portal_staff_dm_insert_ops_admin_message(
  p_thread_id uuid,
  p_body text,
  p_message_type text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_ops uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_type text := lower(trim(coalesce(p_message_type, 'text')));
  v_a uuid;
  v_b uuid;
  v_worker uuid;
  v_tag text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_body = '' then
    raise exception 'empty_body';
  end if;
  if char_length(v_body) > 8000 then
    raise exception 'body_too_long';
  end if;
  if v_type not in ('text', 'voice') then
    v_type := 'text';
  end if;
  if not public.portal_staff_profile_is_portal_admin() then
    raise exception 'forbidden';
  end if;

  v_ops := public.portal_staff_dm_resolve_ops_admin_id();
  if v_ops is null then
    raise exception 'no_ops_admin';
  end if;

  select t.participant_a, t.participant_b
  into v_a, v_b
  from public.portal_staff_dm_threads t
  where t.id = p_thread_id;

  if v_a is null then
    raise exception 'thread_not_found';
  end if;

  if v_a = v_ops then
    v_worker := v_b;
  elsif v_b = v_ops then
    v_worker := v_a;
  else
    raise exception 'not_ops_thread';
  end if;

  if v_worker is null or v_worker = v_ops then
    raise exception 'not_ops_thread';
  end if;

  if v_body !~ '^\[\[portal-dm-operator:' then
    v_tag := '[[portal-dm-operator:' || v_uid::text || ']]';
    if char_length(v_tag || v_body) > 8000 then
      raise exception 'body_too_long';
    end if;
    v_body := v_tag || v_body;
  end if;

  insert into public.portal_staff_dm_messages (thread_id, author_id, body, message_type)
  values (p_thread_id, v_ops, v_body, v_type)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.portal_staff_dm_insert_ops_admin_message(uuid, text, text) is
  'Insert on Sevitha↔worker ops thread as Sevitha (Admin) with operator tag for management attribution.';

commit;
