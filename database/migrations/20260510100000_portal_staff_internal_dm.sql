-- Internal 1:1 staff DM threads + messages (MVP mini-chat).
-- Admin/CEO creates a thread with self + one other staff profile; both participants may read/write messages.

begin;

create table if not exists public.portal_staff_dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  participant_a uuid not null references auth.users (id) on delete cascade,
  participant_b uuid not null references auth.users (id) on delete cascade,
  constraint portal_staff_dm_threads_ordered_pair check (participant_a < participant_b),
  constraint portal_staff_dm_threads_distinct check (participant_a <> participant_b)
);

comment on table public.portal_staff_dm_threads is
  'Ordered DM pair (participant_a < participant_b). Created from admin portal; staff reply in portal.';

create unique index if not exists portal_staff_dm_threads_pair_uidx
  on public.portal_staff_dm_threads (participant_a, participant_b);

create index if not exists portal_staff_dm_threads_updated_idx
  on public.portal_staff_dm_threads (updated_at desc);

create table if not exists public.portal_staff_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.portal_staff_dm_threads (id) on delete cascade,
  created_at timestamptz not null default now(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  body text not null,
  constraint portal_staff_dm_messages_body_len check (char_length(body) <= 8000)
);

comment on table public.portal_staff_dm_messages is
  'Messages inside portal_staff_dm_threads; author must be a thread participant.';

create index if not exists portal_staff_dm_messages_thread_created_idx
  on public.portal_staff_dm_messages (thread_id, created_at asc);

alter table public.portal_staff_dm_threads enable row level security;
alter table public.portal_staff_dm_messages enable row level security;

revoke all on public.portal_staff_dm_threads from public;
revoke all on public.portal_staff_dm_threads from anon;
revoke all on public.portal_staff_dm_messages from public;
revoke all on public.portal_staff_dm_messages from anon;

grant select, insert on public.portal_staff_dm_threads to authenticated;
grant select, insert on public.portal_staff_dm_messages to authenticated;

-- Touch thread.updated_at after each message (SECURITY DEFINER so RLS on threads does not block).
create or replace function public.portal_staff_dm_touch_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portal_staff_dm_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.portal_staff_dm_touch_thread_updated_at() from public;

drop trigger if exists portal_staff_dm_messages_touch_thread on public.portal_staff_dm_messages;
create trigger portal_staff_dm_messages_touch_thread
  after insert on public.portal_staff_dm_messages
  for each row execute procedure public.portal_staff_dm_touch_thread_updated_at();

-- Threads: participants see their rows.
drop policy if exists "portal_staff_dm_threads_select_participant" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_select_participant"
  on public.portal_staff_dm_threads
  for select
  to authenticated
  using (participant_a = (select auth.uid()) or participant_b = (select auth.uid()));

-- Threads: admin/CEO may create only when they are one participant and the peer exists in staff_profiles.
drop policy if exists "portal_staff_dm_threads_insert_admin_ceo" on public.portal_staff_dm_threads;
create policy "portal_staff_dm_threads_insert_admin_ceo"
  on public.portal_staff_dm_threads
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.portal_staff_profile_is_admin_or_ceo()
    and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
  );

-- Messages: only thread participants; author must be self.
drop policy if exists "portal_staff_dm_messages_select_participant" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_select_participant"
  on public.portal_staff_dm_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = thread_id
        and (t.participant_a = (select auth.uid()) or t.participant_b = (select auth.uid()))
    )
  );

drop policy if exists "portal_staff_dm_messages_insert_participant" on public.portal_staff_dm_messages;
create policy "portal_staff_dm_messages_insert_participant"
  on public.portal_staff_dm_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.portal_staff_dm_threads t
      where t.id = thread_id
        and (t.participant_a = (select auth.uid()) or t.participant_b = (select auth.uid()))
    )
  );

-- Let each participant read basic profile rows for their DM counterpart (display names in UI).
drop policy if exists "staff_profiles_select_dm_thread_peer" on public.staff_profiles;
create policy "staff_profiles_select_dm_thread_peer"
  on public.staff_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_staff_dm_threads t
      where (t.participant_a = (select auth.uid()) or t.participant_b = (select auth.uid()))
        and (t.participant_a = staff_profiles.id or t.participant_b = staff_profiles.id)
    )
  );

commit;
