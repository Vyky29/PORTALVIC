-- CEOs open staff chats on the shared ops line (Sevitha ↔ worker).
-- Browser INSERT fails RLS when the CEO is not a thread participant; this RPC creates/finds the ops pair.

begin;

create or replace function public.portal_staff_dm_resolve_ops_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select sp.id
  from public.staff_profiles sp
  where coalesce(sp.is_active, true)
    and lower(coalesce(sp.app_role, '')) = 'admin'
    and (
      public.portal_profile_staff_key(sp.id) = 'sevitha'
      or lower(coalesce(sp.username, '')) in ('sevitha', 'info')
    )
  order by
    case when public.portal_profile_staff_key(sp.id) = 'sevitha' then 0 else 1 end,
    sp.full_name
  limit 1;
$$;

comment on function public.portal_staff_dm_resolve_ops_admin_id() is
  'Ops admin staff_profiles.id for shared management DM line (Sevitha).';

revoke all on function public.portal_staff_dm_resolve_ops_admin_id() from public;
grant execute on function public.portal_staff_dm_resolve_ops_admin_id() to authenticated;

create or replace function public.portal_staff_dm_ensure_ops_thread(p_worker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ops uuid;
  v_a uuid;
  v_b uuid;
  v_tid uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_profile_is_portal_admin() then
    raise exception 'forbidden';
  end if;
  if p_worker_id is null then
    raise exception 'invalid_worker';
  end if;

  v_ops := public.portal_staff_dm_resolve_ops_admin_id();
  if v_ops is null then
    raise exception 'no_ops_admin';
  end if;

  if v_ops < p_worker_id then
    v_a := v_ops;
    v_b := p_worker_id;
  else
    v_a := p_worker_id;
    v_b := v_ops;
  end if;

  select t.id
  into v_tid
  from public.portal_staff_dm_threads t
  where t.participant_a = v_a
    and t.participant_b = v_b;

  if v_tid is not null then
    return v_tid;
  end if;

  insert into public.portal_staff_dm_threads (participant_a, participant_b, created_by)
  values (v_a, v_b, auth.uid())
  on conflict (participant_a, participant_b) do update
    set updated_at = public.portal_staff_dm_threads.updated_at
  returning id into v_tid;

  return v_tid;
end;
$$;

comment on function public.portal_staff_dm_ensure_ops_thread(uuid) is
  'Find or create Sevitha↔worker DM thread for CEO/admin shared inbox open.';

revoke all on function public.portal_staff_dm_ensure_ops_thread(uuid) from public;
grant execute on function public.portal_staff_dm_ensure_ops_thread(uuid) to authenticated;

commit;
