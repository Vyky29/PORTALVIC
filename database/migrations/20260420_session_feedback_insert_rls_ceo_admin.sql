-- Allow session_feedback INSERT when the submitter is staff_profiles with ceo or admin
-- (e.g. Victor uses Staff dashboard but app_role is not literally 'staff'/'lead').
-- feedback_role column still must be 'staff' or 'lead' (table check + form).

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
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

commit;
