-- Relax session_feedback INSERT RLS: require authenticated user in staff_profiles
-- with app_role staff or lead, and submitted_by_user_id = auth.uid().
-- Replaces the previous policy that required (feedback_role = 'lead' AND app_role = 'lead')
-- OR (feedback_role = 'staff' AND app_role IN ('staff','lead')), which failed when
-- app_role casing/storage did not match the lead branch exactly.

begin;

drop policy if exists "session_feedback_insert_staff_lead" on public.session_feedback;

create policy "session_feedback_insert_staff_lead"
on public.session_feedback
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and feedback_role in ('staff', 'lead')
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
  )
);

commit;
