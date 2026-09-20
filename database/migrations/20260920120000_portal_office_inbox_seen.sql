-- Office Family / Staff WhatsApp unread cursors — per signed-in admin, shared across devices.
begin;

create table if not exists public.portal_office_inbox_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  inbox text not null,
  thread_key text not null,
  seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_office_inbox_seen_inbox_chk check (inbox in ('staff_wa', 'family_wa')),
  constraint portal_office_inbox_seen_thread_chk check (length(trim(thread_key)) > 0),
  primary key (user_id, inbox, thread_key)
);

comment on table public.portal_office_inbox_seen is
  'Admin/office WhatsApp unread cursor. Phone and computer for the same login share seen_at.';

create index if not exists portal_office_inbox_seen_user_inbox_idx
  on public.portal_office_inbox_seen (user_id, inbox, seen_at desc);

alter table public.portal_office_inbox_seen enable row level security;

revoke all on public.portal_office_inbox_seen from public;
revoke all on public.portal_office_inbox_seen from anon;
grant select, insert, update, delete on public.portal_office_inbox_seen to authenticated;

drop policy if exists portal_office_inbox_seen_select_own on public.portal_office_inbox_seen;
create policy portal_office_inbox_seen_select_own
  on public.portal_office_inbox_seen
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists portal_office_inbox_seen_insert_own on public.portal_office_inbox_seen;
create policy portal_office_inbox_seen_insert_own
  on public.portal_office_inbox_seen
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists portal_office_inbox_seen_update_own on public.portal_office_inbox_seen;
create policy portal_office_inbox_seen_update_own
  on public.portal_office_inbox_seen
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists portal_office_inbox_seen_delete_own on public.portal_office_inbox_seen;
create policy portal_office_inbox_seen_delete_own
  on public.portal_office_inbox_seen
  for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  begin
    alter publication supabase_realtime add table public.portal_office_inbox_seen;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;

commit;
