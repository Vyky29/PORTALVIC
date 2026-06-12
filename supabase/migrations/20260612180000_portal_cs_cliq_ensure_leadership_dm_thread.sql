-- CS Cliq standalone: find/create 1:1 DM between leadership peers (Victor ↔ Raul, etc.).
-- Browser INSERT can fail RLS edge cases; SECURITY DEFINER RPC uses correct uuid ordering.

begin;

create or replace function public.portal_cs_cliq_ensure_leadership_dm_thread(p_peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security to off
as $$
declare
  v_me uuid;
  v_a uuid;
  v_b uuid;
  v_tid uuid;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_peer_id is null or p_peer_id = v_me then
    raise exception 'invalid_peer';
  end if;

  if not (
    public.portal_staff_profile_is_exec_operator()
    or public.portal_profile_is_executive_trio_member()
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = p_peer_id
      and coalesce(sp.is_active, true)
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or public.portal_staff_profile_is_director_dm_target(sp.id)
      )
  ) then
    raise exception 'invalid_peer';
  end if;

  if v_me < p_peer_id then
    v_a := v_me;
    v_b := p_peer_id;
  else
    v_a := p_peer_id;
    v_b := v_me;
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
  values (v_a, v_b, v_me)
  on conflict (participant_a, participant_b) do update
    set updated_at = public.portal_staff_dm_threads.updated_at
  returning id into v_tid;

  return v_tid;
end;
$$;

comment on function public.portal_cs_cliq_ensure_leadership_dm_thread(uuid) is
  'Find or create a leadership 1:1 DM thread for CS Cliq (directors + ops admin).';

revoke all on function public.portal_cs_cliq_ensure_leadership_dm_thread(uuid) from public;
grant execute on function public.portal_cs_cliq_ensure_leadership_dm_thread(uuid) to authenticated;

commit;
