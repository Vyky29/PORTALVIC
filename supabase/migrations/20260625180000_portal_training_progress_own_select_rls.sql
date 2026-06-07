-- Staff need SELECT on their own training/setup rows for PostgREST upsert (ON CONFLICT UPDATE).

begin;

drop policy if exists "portal_training_progress_select_own" on public.portal_staff_training_progress;
create policy "portal_training_progress_select_own"
  on public.portal_staff_training_progress for select to authenticated
  using (staff_user_id = auth.uid());

drop policy if exists "portal_setup_status_select_own" on public.portal_staff_setup_status;
create policy "portal_setup_status_select_own"
  on public.portal_staff_setup_status for select to authenticated
  using (staff_user_id = auth.uid());

commit;
