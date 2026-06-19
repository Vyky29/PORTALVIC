-- Web Push when admin inserts portal_staff_announcements (same pattern as schedule_overrides).
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET from Edge secrets before applying.
-- Requires: 20260601140000_portal_webpush_announcement_sent.sql + portal-push-dispatch-announcement deployed.

begin;

drop trigger if exists "portal-push-announcement" on public.portal_staff_announcements;

create trigger "portal-push-announcement"
after insert on public.portal_staff_announcements
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-announcement',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
