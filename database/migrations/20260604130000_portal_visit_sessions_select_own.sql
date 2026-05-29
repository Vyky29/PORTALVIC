-- Let any signed-in user read their OWN portal_staff_visit_sessions rows.
-- The table only had select-for-admin/ceo, which breaks the insert ... returning
-- representation and session resume for normal staff/lead (and can surface as 403
-- on the insert round-trip). Admin/CEO keep org-wide read via the existing policy.
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.

begin;

drop policy if exists "portal_visit_sessions_select_own" on public.portal_staff_visit_sessions;
create policy "portal_visit_sessions_select_own"
  on public.portal_staff_visit_sessions
  for select
  to authenticated
  using (staff_user_id = auth.uid());

commit;
