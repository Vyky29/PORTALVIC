-- CLIENT list "On Trial / Trialled" reads these from the admin session.
-- Rows stay admin/CEO only. The page selects names and dates, not a public dump.

grant select on public.portal_post_trial_offers to authenticated;
grant select on public.portal_booking_slot_reservations to authenticated;

drop policy if exists portal_post_trial_offers_admin_select on public.portal_post_trial_offers;
create policy portal_post_trial_offers_admin_select
  on public.portal_post_trial_offers
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_booking_slot_reservations_admin_select on public.portal_booking_slot_reservations;
create policy portal_booking_slot_reservations_admin_select
  on public.portal_booking_slot_reservations
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());
