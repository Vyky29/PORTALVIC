-- Fix roster Web Push trigger: must send x-portal-webhook-secret (matches Edge secret PORTAL_PUSH_WEBHOOK_SECRET).
-- Apply in SQL Editor if trigger already exists without the header (403 from portal-push-dispatch-schedule-override).
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with the value from Supabase Edge Secrets before running.

begin;

drop trigger if exists "schedule-overrides-web-push" on public.schedule_overrides;

create trigger "schedule-overrides-web-push"
after insert on public.schedule_overrides
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-schedule-override',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
