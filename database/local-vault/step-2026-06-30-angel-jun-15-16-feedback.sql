-- Angel Falceto: Jun 15–16 feedback already submitted; normalize keys + quick marks so My Term stops showing orange.

update public.session_feedback
set portal_session_key = '2026-06-15|adam_p|aquatic'
where id = 'ba9f9064-116a-422c-b6db-bf5f7d061f1d';

update public.session_feedback
set portal_session_key = '2026-06-15|steven|aquatic'
where id = 'f3ec5f75-8277-4753-b5e5-9cdb2bdb75c3';

insert into public.portal_staff_session_quick_marks (staff_user_id, portal_session_key, session_date, mark_type)
values
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-15|adam_p|aquatic', '2026-06-15', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-15|mario|aquatic', '2026-06-15', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-15|steven|aquatic', '2026-06-15', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|amir|aquatic', '2026-06-16', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|rayan_ta|aquatic', '2026-06-16', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|richard|aquatic', '2026-06-16', 'feedback_done'),
  ('3025f245-947e-49e0-8e31-6366051ceb9e', '2026-06-16|cayra|aquatic', '2026-06-16', 'feedback_done')
on conflict (staff_user_id, portal_session_key, mark_type) do nothing;
