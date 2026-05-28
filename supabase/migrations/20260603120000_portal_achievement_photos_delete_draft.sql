-- Staff/lead: delete own draft achievement photos (+ storage object).

begin;

grant delete on table public.portal_participant_achievement_photos to authenticated;

drop policy if exists portal_achievement_photos_delete_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_delete_staff_draft
  on public.portal_participant_achievement_photos
  for delete
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status = 'draft'
    and public.portal_staff_is_staff_or_lead()
  );

drop policy if exists portal_achievement_storage_delete_staff on storage.objects;
create policy portal_achievement_storage_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.portal_staff_is_staff_or_lead()
  );

commit;
