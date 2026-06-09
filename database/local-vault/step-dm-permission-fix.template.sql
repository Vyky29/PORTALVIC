-- Fix DM send/load: exec-operator shared inbox + portal_staff_dm_insert_message RPC.
-- Safe to re-run. Apply on Portal cklpnwhlqsulpmkipmqb.

begin;

create or replace function public.portal_staff_profile_is_exec_operator()
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
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
      )
  );
$$;

revoke all on function public.portal_staff_profile_is_exec_operator() from public;
grant execute on function public.portal_staff_profile_is_exec_operator() to authenticated;

create or replace function public.portal_staff_profile_is_portal_admin()
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
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        sp.app_role in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
        or public.portal_profile_staff_key(sp.id) in ('sevitha')
      )
  );
$$;

revoke all on function public.portal_staff_profile_is_portal_admin() from public;
grant execute on function public.portal_staff_profile_is_portal_admin() to authenticated;

grant select, insert on public.portal_staff_dm_threads to authenticated;
grant select, insert on public.portal_staff_dm_messages to authenticated;

drop policy if exists "portal_staff_dm_threads_select_admin_ceo_shared_inbox" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_threads
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

drop policy if exists "portal_staff_dm_messages_select_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_select_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for select
  to authenticated
  using (public.portal_staff_profile_is_exec_operator());

drop policy if exists "portal_staff_dm_messages_insert_admin_ceo_shared_inbox" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_admin_ceo_shared_inbox"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_exec_operator()
    and exists (select 1 from public.portal_staff_dm_threads t where t.id = thread_id)
  );

drop policy if exists "portal_staff_dm_messages_insert_portal_admin" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_portal_admin"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.portal_staff_profile_is_portal_admin()
    and exists (select 1 from public.portal_staff_dm_threads t where t.id = thread_id)
  );

create or replace function public.portal_staff_dm_insert_message(
  p_thread_id uuid,
  p_body text,
  p_message_type text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_type text := lower(trim(coalesce(p_message_type, 'text')));
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

  if not (
    exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = p_thread_id
        and (t.participant_a = v_uid or t.participant_b = v_uid)
    )
    or public.portal_staff_profile_is_portal_admin()
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.portal_staff_dm_messages (thread_id, author_id, body, message_type)
  values (p_thread_id, v_uid, v_body, v_type)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.portal_staff_dm_insert_message(uuid, text, text) from public;
grant execute on function public.portal_staff_dm_insert_message(uuid, text, text) to authenticated;

commit;
