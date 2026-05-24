-- Late submission requests: admin SELECT/UPDATE must use SECURITY DEFINER helper
-- (same pattern as announcements / DM). Inline EXISTS on staff_profiles can fail under RLS.

begin;

create or replace function public.portal_staff_profile_is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and (
        sp.app_role in ('admin', 'ceo')
        or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
      )
  );
$$;

comment on function public.portal_staff_profile_is_portal_admin() is
  'True when the signed-in user may use the operations admin dashboard (admin/ceo app_role or manager/admin staff_role).';

revoke all on function public.portal_staff_profile_is_portal_admin() from public;
grant execute on function public.portal_staff_profile_is_portal_admin() to authenticated;

drop policy if exists "portal_late_submission_select_own" on public.portal_late_submission_requests;
create policy "portal_late_submission_select_own"
on public.portal_late_submission_requests
for select
to authenticated
using (
  staff_user_id = auth.uid()
  or public.portal_staff_profile_is_portal_admin()
);

drop policy if exists "portal_late_submission_update_admin" on public.portal_late_submission_requests;
create policy "portal_late_submission_update_admin"
on public.portal_late_submission_requests
for update
to authenticated
using (public.portal_staff_profile_is_portal_admin())
with check (public.portal_staff_profile_is_portal_admin());

commit;
