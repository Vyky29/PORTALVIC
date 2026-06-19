-- Staff may read achievement storage for any row referenced in portal_participant_achievement_photos
-- (draft pool, attached to feedback, or archived unused) — not only own folder + draft.

begin;

drop policy if exists portal_achievement_storage_select_staff_shared on storage.objects;
create policy portal_achievement_storage_select_staff_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_can_use_achievement_photos()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.portal_participant_achievement_photos p
        where p.storage_path = objects.name
          and p.status in ('draft', 'attached', 'archived_unused')
      )
    )
  );

comment on policy portal_achievement_storage_select_staff_shared on storage.objects is
  'Own folder or any achievement photo/video row (draft, attached, archived) — co-instructors and feedback viewers.';

commit;
