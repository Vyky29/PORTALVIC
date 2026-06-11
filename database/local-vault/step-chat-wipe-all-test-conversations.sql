-- One-shot: wipe all CS Cliq / portal chat test data (Portal project cklpnwhlqsulpmkipmqb).
-- Run in Supabase Dashboard → SQL Editor.
--
-- NOTE: Supabase blocks DELETE on storage.objects from SQL. After this script, either:
--   • Dashboard → Storage → portal-dm-audio + portal-dm-media → delete all files, or
--   • node database/local-vault/wipe-chat-storage.mjs  (needs SUPABASE_SERVICE_ROLE_KEY in secrets.template.env)

begin;

delete from public.portal_webpush_incoming_call_sent;
delete from public.portal_webpush_staff_dm_sent;
delete from public.portal_webpush_admin_alert_sent
where source_table in ('portal_staff_dm_messages', 'portal_ceo_group_message');
delete from public.portal_dm_read_cursor;
delete from public.portal_ceo_group_message;
delete from public.portal_staff_dm_messages;
delete from public.portal_staff_dm_threads;
update public.portal_ceo_group set updated_at = now();

commit;

-- Sanity check (expect 0):
-- select
--   (select count(*) from portal_staff_dm_threads) as dm_threads,
--   (select count(*) from portal_staff_dm_messages) as dm_messages,
--   (select count(*) from portal_ceo_group_message) as group_messages;
