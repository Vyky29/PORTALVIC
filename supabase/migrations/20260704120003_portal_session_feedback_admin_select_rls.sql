-- Let corporate exec Auth emails read session_feedback even when staff_profiles.id
-- is not linked yet (same pattern as portal_staff_profile_is_admin_or_ceo).

begin;

drop policy if exists "session_feedback_select_admin_ceo" on public.session_feedback;

create policy "session_feedback_select_admin_ceo"
on public.session_feedback
for select
to authenticated
using (public.portal_staff_profile_is_admin_or_ceo());

commit;
