-- Mirror of supabase/migrations/20260626120000_portal_dm_read_cursor.sql

begin;

create table if not exists public.portal_dm_read_cursor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.portal_staff_dm_threads(id) on delete cascade,
  group_id uuid references public.portal_ceo_group(id) on delete cascade,
  read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_dm_read_cursor_target_chk check (
    (thread_id is not null and group_id is null)
    or (thread_id is null and group_id is not null)
  )
);

create unique index if not exists portal_dm_read_cursor_user_thread_uidx
  on public.portal_dm_read_cursor (user_id, thread_id)
  where thread_id is not null;

create unique index if not exists portal_dm_read_cursor_user_group_uidx
  on public.portal_dm_read_cursor (user_id, group_id)
  where group_id is not null;

create index if not exists portal_dm_read_cursor_user_id_idx
  on public.portal_dm_read_cursor (user_id);

alter table public.portal_dm_read_cursor enable row level security;

drop policy if exists portal_dm_read_cursor_select_own on public.portal_dm_read_cursor;
create policy portal_dm_read_cursor_select_own
  on public.portal_dm_read_cursor
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists portal_dm_read_cursor_insert_own on public.portal_dm_read_cursor;
create policy portal_dm_read_cursor_insert_own
  on public.portal_dm_read_cursor
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists portal_dm_read_cursor_update_own on public.portal_dm_read_cursor;
create policy portal_dm_read_cursor_update_own
  on public.portal_dm_read_cursor
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists portal_dm_read_cursor_delete_own on public.portal_dm_read_cursor;
create policy portal_dm_read_cursor_delete_own
  on public.portal_dm_read_cursor
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.portal_dm_mark_thread_read(
  p_thread_id uuid,
  p_read_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_read timestamptz := coalesce(p_read_at, now());
  v_out timestamptz;
begin
  if v_uid is null or p_thread_id is null then
    return null;
  end if;
  update public.portal_dm_read_cursor
  set read_at = greatest(read_at, v_read),
      updated_at = now()
  where user_id = v_uid
    and thread_id = p_thread_id
  returning read_at into v_out;
  if found then
    return v_out;
  end if;
  begin
    insert into public.portal_dm_read_cursor (user_id, thread_id, read_at, updated_at)
    values (v_uid, p_thread_id, v_read, now())
    returning read_at into v_out;
    return v_out;
  exception
    when unique_violation then
      update public.portal_dm_read_cursor
      set read_at = greatest(read_at, v_read),
          updated_at = now()
      where user_id = v_uid
        and thread_id = p_thread_id
      returning read_at into v_out;
      return v_out;
  end;
end;
$$;

create or replace function public.portal_dm_mark_group_read(
  p_group_id uuid,
  p_read_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_read timestamptz := coalesce(p_read_at, now());
  v_out timestamptz;
begin
  if v_uid is null or p_group_id is null then
    return null;
  end if;
  update public.portal_dm_read_cursor
  set read_at = greatest(read_at, v_read),
      updated_at = now()
  where user_id = v_uid
    and group_id = p_group_id
  returning read_at into v_out;
  if found then
    return v_out;
  end if;
  begin
    insert into public.portal_dm_read_cursor (user_id, group_id, read_at, updated_at)
    values (v_uid, p_group_id, v_read, now())
    returning read_at into v_out;
    return v_out;
  exception
    when unique_violation then
      update public.portal_dm_read_cursor
      set read_at = greatest(read_at, v_read),
          updated_at = now()
      where user_id = v_uid
        and group_id = p_group_id
      returning read_at into v_out;
      return v_out;
  end;
end;
$$;

revoke all on function public.portal_dm_mark_thread_read(uuid, timestamptz) from public;
revoke all on function public.portal_dm_mark_group_read(uuid, timestamptz) from public;
grant execute on function public.portal_dm_mark_thread_read(uuid, timestamptz) to authenticated;
grant execute on function public.portal_dm_mark_group_read(uuid, timestamptz) to authenticated;

comment on table public.portal_dm_read_cursor is
  'Per-user read cursor for portal_staff_dm_threads and portal_ceo_group — syncs unread across devices.';

commit;
