-- Admin/CEO can attach a walkthrough video to an existing venue review row.
begin;

drop policy if exists venue_reviews_update_admin_ceo on public.venue_reviews;
create policy venue_reviews_update_admin_ceo
  on public.venue_reviews
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

commit;
