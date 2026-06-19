-- Admin/CEO can list staff Web Push subscriptions for the Push devices monitoring view.
begin;

drop policy if exists "portal_push_subscriptions_select_admin" on public.portal_push_subscriptions;
create policy "portal_push_subscriptions_select_admin"
  on public.portal_push_subscriptions
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

commit;
