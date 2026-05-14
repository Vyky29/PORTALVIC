-- See database/migrations/20260429120000_portal_staff_session_quick_marks.sql (same content).

begin;

create table if not exists public.portal_staff_session_quick_marks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  portal_session_key text not null,
  session_date date not null,
  mark_type text not null,
  constraint portal_staff_session_quick_marks_mark_type_check
    check (mark_type in ('absent', 'feedback_done')),
  constraint portal_staff_session_quick_marks_unique_per_session
    unique (staff_user_id, portal_session_key, mark_type)
);

create index if not exists portal_staff_session_quick_marks_staff_date_idx
  on public.portal_staff_session_quick_marks (staff_user_id, session_date desc);

create index if not exists portal_staff_session_quick_marks_session_key_idx
  on public.portal_staff_session_quick_marks (portal_session_key)
  where portal_session_key is not null;

alter table public.portal_staff_session_quick_marks enable row level security;

grant select, insert, delete on table public.portal_staff_session_quick_marks to authenticated;

drop policy if exists "portal_quick_marks_select_own" on public.portal_staff_session_quick_marks;
create policy "portal_quick_marks_select_own"
on public.portal_staff_session_quick_marks
for select
to authenticated
using (staff_user_id = auth.uid());

drop policy if exists "portal_quick_marks_insert_own" on public.portal_staff_session_quick_marks;
create policy "portal_quick_marks_insert_own"
on public.portal_staff_session_quick_marks
for insert
to authenticated
with check (staff_user_id = auth.uid());

drop policy if exists "portal_quick_marks_delete_own" on public.portal_staff_session_quick_marks;
create policy "portal_quick_marks_delete_own"
on public.portal_staff_session_quick_marks
for delete
to authenticated
using (staff_user_id = auth.uid());

commit;
