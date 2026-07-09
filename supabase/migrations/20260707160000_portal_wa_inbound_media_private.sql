-- Make inbound WhatsApp media private.
--
-- Family media (photos, stickers, etc. — potentially images of children) was
-- kept in a PUBLIC bucket relying on unguessable wa_message_id paths
-- ("private by obscurity"). That is not good enough for safeguarding: a public
-- URL works forever for anyone who ever sees it (logs, screenshots, forwards).
--
-- This migration switches the bucket to PRIVATE and moves the admin panel to
-- short-lived signed URLs. We store the object PATH (not a public URL) and add
-- a storage RLS policy so only authenticated portal admins can sign/read those
-- objects. The webhook keeps writing with the service role (bypasses RLS).

begin;

-- 1) Flip the bucket to private.
update storage.buckets set public = false where id = 'wa-inbound-media';

-- 2) Store the object path so the admin can mint signed URLs on demand.
alter table public.portal_parent_whatsapp_inbound
  add column if not exists media_path text;

-- Backfill media_path from the previously stored public URLs.
update public.portal_parent_whatsapp_inbound
set media_path = split_part(media_url, '/wa-inbound-media/', 2)
where media_url is not null
  and media_path is null
  and position('/wa-inbound-media/' in media_url) > 0;

-- 3) Let authenticated portal admins read (and therefore sign) these objects.
drop policy if exists portal_wa_inbound_media_select_admin on storage.objects;
create policy portal_wa_inbound_media_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wa-inbound-media'
    and public.portal_staff_profile_is_portal_admin()
  );

commit;
