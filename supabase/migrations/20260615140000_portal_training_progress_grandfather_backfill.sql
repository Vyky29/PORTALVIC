-- Backfill grandfathered induction progress (Zoho-era staff). Alex, Michelle, Carlos still need full M1–M6 in-app.

begin;

insert into public.portal_staff_training_progress (
  staff_user_id,
  track,
  current_module,
  modules_total,
  progress_pct,
  module_states,
  phase_label,
  completed_at
)
select
  sp.id,
  'induction',
  6,
  6,
  100,
  jsonb_build_object(
    '1', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done'),
    '2', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done'),
    '3', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done'),
    '4', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done'),
    '5', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done'),
    '6', jsonb_build_object('journey', true, 'video', true, 'quizPass', true, 'label', 'Done')
  ),
  'Grandfathered complete',
  timestamptz '2026-05-01 12:00:00+00'
from public.staff_profiles sp
where coalesce(sp.is_active, true)
  and lower(trim(coalesce(nullif(trim(sp.username), ''), split_part(trim(sp.full_name), ' ', 1)))) not in (
    'alex', 'michelle', 'carlos'
  )
on conflict (staff_user_id, track) do update
set
  current_module = excluded.current_module,
  modules_total = excluded.modules_total,
  progress_pct = excluded.progress_pct,
  module_states = excluded.module_states,
  phase_label = excluded.phase_label,
  completed_at = coalesce(public.portal_staff_training_progress.completed_at, excluded.completed_at),
  updated_at = now()
where public.portal_staff_training_progress.progress_pct < 100
   or public.portal_staff_training_progress.phase_label ilike '%not started%';

commit;
