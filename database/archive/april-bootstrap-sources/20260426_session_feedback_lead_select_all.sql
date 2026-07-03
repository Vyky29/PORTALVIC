-- Allow service leads to SELECT all session_feedback rows (same table scope as admin/ceo policy).
-- Needed for performance.html context when a lead opens ?subject=<staff uuid>.
-- Permissive RLS: combined with existing policies via OR.

begin;

drop policy if exists "session_feedback_select_lead_all" on public.session_feedback;
create policy "session_feedback_select_lead_all"
on public.session_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role = 'lead'
  )
);

commit;
