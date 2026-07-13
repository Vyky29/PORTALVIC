-- Announcement photos: CEOs/admins can SELECT media + storage (they already see announcements).
-- Previously SELECT used only portal_staff_is_staff_or_lead(), so CEO recipients saw the
-- reminder/announcement but an empty photo gallery.

begin;

drop policy if exists portal_announcement_media_select_staff on public.portal_staff_announcement_media;
create policy portal_announcement_media_select_staff
  on public.portal_staff_announcement_media
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

drop policy if exists portal_announcement_media_storage_select on storage.objects;
create policy portal_announcement_media_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portal-announcement-media'
    and (
      public.portal_staff_is_staff_or_lead()
      or public.portal_staff_profile_is_admin_or_ceo()
    )
  );

commit;
