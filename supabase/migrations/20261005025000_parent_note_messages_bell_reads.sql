-- Parent writes on a session note. Admin bell: Reply or Close.
-- Photo download Close uses the same per-admin read table.
-- Close on one admin does not clear it for the others.
-- No parent push is sent from these tables.

begin;

create table if not exists public.portal_parent_note_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  note_key text not null,
  session_date date null,
  service_label text not null default '',
  child_name text not null default '',
  parent_body text not null,
  admin_reply text null,
  admin_replied_at timestamptz null,
  admin_replied_by uuid null references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint portal_parent_note_messages_body_len check (char_length(parent_body) between 1 and 2000)
);

create index if not exists portal_parent_note_messages_contact_idx
  on public.portal_parent_note_messages (contact_id, created_at desc);

create index if not exists portal_parent_note_messages_open_idx
  on public.portal_parent_note_messages (created_at desc);

alter table public.portal_parent_note_messages enable row level security;

revoke all on public.portal_parent_note_messages from public, anon, authenticated;
grant select, update on public.portal_parent_note_messages to authenticated;
grant select, insert, update on public.portal_parent_note_messages to service_role;

drop policy if exists portal_parent_note_messages_admin_select
  on public.portal_parent_note_messages;
create policy portal_parent_note_messages_admin_select
on public.portal_parent_note_messages
for select
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_parent_note_messages_admin_update
  on public.portal_parent_note_messages;
create policy portal_parent_note_messages_admin_update
on public.portal_parent_note_messages
for update
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo())
with check (public.portal_staff_profile_is_admin_or_ceo());

create table if not exists public.portal_admin_bell_item_reads (
  item_kind text not null check (item_kind in ('photo_download', 'parent_note')),
  item_id text not null,
  user_id uuid not null references public.staff_profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (item_kind, item_id, user_id)
);

create index if not exists portal_admin_bell_item_reads_user_idx
  on public.portal_admin_bell_item_reads (user_id);

alter table public.portal_admin_bell_item_reads enable row level security;

revoke all on public.portal_admin_bell_item_reads from public, anon;
grant select, insert on public.portal_admin_bell_item_reads to authenticated;
grant select, insert, update, delete on public.portal_admin_bell_item_reads to service_role;

drop policy if exists portal_admin_bell_item_reads_select_own
  on public.portal_admin_bell_item_reads;
create policy portal_admin_bell_item_reads_select_own
on public.portal_admin_bell_item_reads
for select
to authenticated
using (
  user_id = auth.uid()
  and public.portal_staff_profile_is_admin_or_ceo()
);

drop policy if exists portal_admin_bell_item_reads_insert_own
  on public.portal_admin_bell_item_reads;
create policy portal_admin_bell_item_reads_insert_own
on public.portal_admin_bell_item_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.portal_staff_profile_is_admin_or_ceo()
);

commit;
