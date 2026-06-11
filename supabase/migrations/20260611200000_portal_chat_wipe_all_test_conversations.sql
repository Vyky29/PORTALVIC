-- Wipe ALL CS Cliq / portal chat test data (Portal Supabase cklpnwhlqsulpmkipmqb).
-- Stakeholder OK: chat + calls were pilot-only; no production conversations to keep.
--
-- REMOVES:
--   • All 1:1 DM threads + messages (incl. call invites, voice notes, attachments metadata)
--   • All CEO/group channel messages
--   • Per-user read cursors for chat
--   • Chat/call Web Push dedupe rows
--   • (Storage files: use Dashboard Storage UI or wipe-chat-storage.mjs — not SQL)
--
-- KEEPS:
--   • portal_ceo_group rows (channel shells: all_ceos, staff_leads_ops, pool channels, …)
--   • staff_profiles, auth, roster, feedback, announcements, push subscriptions
--
-- Apply: Supabase Dashboard → SQL → paste whole file → Run
--   or: npx supabase db query --linked -f supabase/migrations/20260611200000_portal_chat_wipe_all_test_conversations.sql

begin;

-- Web Push dedupe (chat / incoming call only)
delete from public.portal_webpush_incoming_call_sent;

delete from public.portal_webpush_staff_dm_sent;

delete from public.portal_webpush_admin_alert_sent
where source_table in ('portal_staff_dm_messages', 'portal_ceo_group_message');

-- Unread / last-read markers
delete from public.portal_dm_read_cursor;

-- Group channel messages (groups themselves remain)
delete from public.portal_ceo_group_message;

-- 1:1 DMs (messages cascade if threads deleted first; explicit for clarity)
delete from public.portal_staff_dm_messages;
delete from public.portal_staff_dm_threads;

-- Optional: reset channel "last activity" timestamps
update public.portal_ceo_group
set updated_at = now();

commit;
