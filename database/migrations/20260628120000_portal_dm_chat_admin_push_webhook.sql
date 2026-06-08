-- Web Push for internal chat messages (DM + CEO group) to all admin/CEO when app is closed.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET from Edge secrets before applying.
-- Deploy Edge Function: portal-push-dispatch-admin-alert
-- Dedupe table: portal_webpush_admin_alert_sent (20260617120000_portal_webpush_admin_alert_sent.sql)

begin;

drop trigger if exists "portal-staff-dm-admin-chat-push" on public.portal_staff_dm_messages;
create trigger "portal-staff-dm-admin-chat-push"
after insert on public.portal_staff_dm_messages
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

drop trigger if exists "portal-ceo-group-admin-chat-push" on public.portal_ceo_group_message;
create trigger "portal-ceo-group-admin-chat-push"
after insert on public.portal_ceo_group_message
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
