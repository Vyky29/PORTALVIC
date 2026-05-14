-- Align session_feedback with two-step form: when attendance = 'No', second-phase fields are omitted (null).
-- Existing rows keep their values; only NOT NULL is relaxed.
-- Apply after 20260415_session_feedback.sql and 20260416_session_feedback_context.sql.

begin;

alter table public.session_feedback
  alter column engagement_rating drop not null;

alter table public.session_feedback
  alter column client_emotions drop not null;

-- Reviewed (already nullable, no change):
--   positive_feedback
--   relevant_information

commit;
