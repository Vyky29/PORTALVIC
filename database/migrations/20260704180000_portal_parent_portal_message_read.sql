-- Mirror: supabase/migrations/20260704180000_portal_parent_portal_message_read.sql

begin;

create table if not exists public.portal_parent_portal_message_read (
  parent_person_id text primary key,
  read_at timestamptz not null default '1970-01-01'::timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.portal_parent_portal_message_read is
  'Family portal inbox read cursor — outbound notify_log rows after read_at count as unread.';

alter table public.portal_parent_portal_message_read enable row level security;
revoke all on public.portal_parent_portal_message_read from public, anon, authenticated;
grant select, insert, update on public.portal_parent_portal_message_read to service_role;

create or replace function public.portal_parent_portal_mark_messages_read(
  p_parent_person_id text,
  p_read_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out timestamptz := coalesce(p_read_at, now());
begin
  if coalesce(trim(p_parent_person_id), '') = '' then
    return v_out;
  end if;
  insert into public.portal_parent_portal_message_read (parent_person_id, read_at, updated_at)
  values (p_parent_person_id, v_out, now())
  on conflict (parent_person_id) do update
  set read_at = greatest(portal_parent_portal_message_read.read_at, excluded.read_at),
      updated_at = now()
  returning read_at into v_out;
  return v_out;
end;
$$;

revoke all on function public.portal_parent_portal_mark_messages_read(text, timestamptz) from public;
grant execute on function public.portal_parent_portal_mark_messages_read(text, timestamptz) to service_role;

commit;
