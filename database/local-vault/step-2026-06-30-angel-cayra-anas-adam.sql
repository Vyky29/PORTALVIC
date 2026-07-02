-- Angel Jun 16: Cayra absent; session was Anas (4.30 slot). Repoint submitted feedback to Anas + Cayra absent row.
-- Angel Jun 15: Adam Pi one block 4–5.30 — ensure timed aquatic key matches merged slot.

-- Existing Cayra "Yes" row is actually Anas session feedback.
update public.session_feedback
set
  client_name = 'Anas',
  client_id = 'anas',
  portal_session_key = '2026-06-16|anas|aquatic',
  session_time = '4.30 to 5',
  positive_feedback = coalesce(positive_feedback, '') || ' (Recorded under Cayra in error; participant was Anas.)'
where id = '703b5ad9-612d-4cdd-8ecb-89c8bdcfb0d8';

insert into public.session_feedback (
  submitted_by_user_id,
  feedback_role,
  portal_session_key,
  client_name,
  client_id,
  session_date,
  session_time,
  service,
  attendance,
  engagement_rating,
  engagement_patterns,
  positive_feedback,
  client_emotions,
  exceptional_challenges,
  incidents,
  completed_by_name,
  has_positive_feedback,
  has_exceptional_challenges,
  has_relevant_information,
  late_session_feedback
)
values (
  '3025f245-947e-49e0-8e31-6366051ceb9e',
  'staff',
  '2026-06-16|cayra|aquatic',
  'Cayra',
  'cayra',
  '2026-06-16',
  '4.30 to 5',
  'Aquatic Activity',
  'No',
  null,
  '{}'::text[],
  null,
  null,
  null,
  null,
  'Angel Falceto',
  false,
  false,
  false,
  false
);

delete from public.portal_staff_session_quick_marks
where staff_user_id = '3025f245-947e-49e0-8e31-6366051ceb9e'
  and session_date = '2026-06-16'
  and portal_session_key = '2026-06-16|cayra|aquatic'
  and mark_type = 'feedback_done';

insert into public.portal_staff_session_quick_marks (staff_user_id, portal_session_key, session_date, mark_type)
values
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|cayra|aquatic', '2026-06-16', 'absent'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|anas|aquatic', '2026-06-16', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|16:30|anas|aquatic', '2026-06-16', 'feedback_done')
on conflict (staff_user_id, portal_session_key, mark_type) do nothing;

-- Adam Pi Mon 15 Jun: one merged 4–5.30 block (3×30' internally); align timed key for aquatic matching.
insert into public.portal_staff_session_quick_marks (staff_user_id, portal_session_key, session_date, mark_type)
values
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-15|16:00|adam_p|aquatic', '2026-06-15', 'feedback_done')
on conflict (staff_user_id, portal_session_key, mark_type) do nothing;
