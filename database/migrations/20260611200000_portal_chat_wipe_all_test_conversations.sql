-- Mirror of supabase/migrations/20260611200000_portal_chat_wipe_all_test_conversations.sql
-- Wipe ALL portal chat test conversations on Portal Supabase.

begin;

delete from public.portal_webpush_incoming_call_sent;

delete from public.portal_webpush_staff_dm_sent;

delete from public.portal_webpush_admin_alert_sent
where source_table in ('portal_staff_dm_messages', 'portal_ceo_group_message');

delete from public.portal_dm_read_cursor;

delete from public.portal_ceo_group_message;

delete from public.portal_staff_dm_messages;
delete from public.portal_staff_dm_threads;

update public.portal_ceo_group
set updated_at = now();

commit;
