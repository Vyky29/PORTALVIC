-- Log unanswered Portal help bot questions (FAQ phase 1).

begin;

create table if not exists public.portal_help_unanswered_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  staff_id        uuid not null references public.staff_profiles (id) on delete cascade,
  staff_full_name text,
  question_text   text not null,
  best_guess_id   text,
  best_score      integer not null default 0
);

comment on table public.portal_help_unanswered_log is
  'Staff/lead Portal help bot questions with no confident FAQ match — used to expand portal_help_knowledge.json.';

create index if not exists portal_help_unanswered_log_created_at_idx
  on public.portal_help_unanswered_log (created_at desc);

create index if not exists portal_help_unanswered_log_staff_id_idx
  on public.portal_help_unanswered_log (staff_id);

alter table public.portal_help_unanswered_log enable row level security;

drop policy if exists portal_help_unanswered_log_insert_self
  on public.portal_help_unanswered_log;
create policy portal_help_unanswered_log_insert_self
  on public.portal_help_unanswered_log
  for insert
  to authenticated
  with check (auth.uid() = staff_id);

drop policy if exists portal_help_unanswered_log_select_admin
  on public.portal_help_unanswered_log;
create policy portal_help_unanswered_log_select_admin
  on public.portal_help_unanswered_log
  for select
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

grant insert, select on public.portal_help_unanswered_log to authenticated;
grant all on public.portal_help_unanswered_log to service_role;

commit;
