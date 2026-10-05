-- Relevant-information bell is per admin, like venue Close.
-- Close on one admin does not clear the note for the others.

begin;

create table if not exists public.session_feedback_note_alert_reads (
  session_feedback_id uuid not null references public.session_feedback (id) on delete cascade,
  user_id uuid not null references public.staff_profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (session_feedback_id, user_id)
);

create index if not exists session_feedback_note_alert_reads_user_idx
  on public.session_feedback_note_alert_reads (user_id);

alter table public.session_feedback_note_alert_reads enable row level security;

grant select, insert on table public.session_feedback_note_alert_reads to authenticated;

drop policy if exists "session_feedback_note_reads_select_own"
  on public.session_feedback_note_alert_reads;
create policy "session_feedback_note_reads_select_own"
on public.session_feedback_note_alert_reads
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "session_feedback_note_reads_insert_own"
  on public.session_feedback_note_alert_reads;
create policy "session_feedback_note_reads_insert_own"
on public.session_feedback_note_alert_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
