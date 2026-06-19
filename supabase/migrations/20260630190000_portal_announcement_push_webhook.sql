-- Mirror of database/migrations/20260630190000_portal_announcement_push_webhook.sql

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
