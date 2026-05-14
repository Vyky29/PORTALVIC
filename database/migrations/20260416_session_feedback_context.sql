-- Session feedback: context-only fields + optional incidents column (incidents handled elsewhere).
-- Apply after 20260415_session_feedback.sql (table must exist).

begin;

alter table public.session_feedback
  add column if not exists client_id text null,
  add column if not exists session_time text null,
  add column if not exists relevant_information text null,
  add column if not exists has_relevant_information boolean not null default false;

alter table public.session_feedback
  alter column incidents drop not null;

commit;
