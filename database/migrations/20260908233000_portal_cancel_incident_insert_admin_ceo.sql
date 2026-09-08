-- Allow admin / ceo / manager to insert cancellation + incident reports
-- (same as staff/lead). UI already treats those roles as submitters;
-- RLS was still staff|lead only → CEO (Victor) got RLS deny on submit.

begin;

drop policy if exists "cancellation_reports_insert_staff_lead" on public.cancellation_reports;
create policy "cancellation_reports_insert_staff_lead"
on public.cancellation_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'admin', 'ceo', 'manager')
  )
);

drop policy if exists "incident_reports_insert_staff_lead" on public.incident_reports;
create policy "incident_reports_insert_staff_lead"
on public.incident_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'admin', 'ceo', 'manager')
  )
);

commit;
