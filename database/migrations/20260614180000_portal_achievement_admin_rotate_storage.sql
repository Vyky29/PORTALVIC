-- Admin/CEO: overwrite achievement photo bytes in Storage (rotate) + update row dimensions.

begin;

drop policy if exists portal_achievement_photos_update_admin on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_update_admin
  on public.portal_participant_achievement_photos
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_achievement_storage_update_admin on storage.objects;
create policy portal_achievement_storage_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  )
  with check (
    bucket_id = 'participant-achievements'
    and public.portal_staff_profile_is_admin_or_ceo()
  );

grant update on table public.portal_participant_achievement_photos to authenticated;

comment on policy portal_achievement_photos_update_admin on public.portal_participant_achievement_photos is
  'Admin/CEO may update achievement photo metadata (e.g. width/height after rotate).';

commit;
