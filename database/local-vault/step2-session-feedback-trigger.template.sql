-- Portal: instant admin push when session_feedback is inserted (late feedback).
-- Copy → step2-session-feedback-trigger.local.sql, replace __PORTAL_PUSH_WEBHOOK_SECRET__,
-- then: supabase db query --linked -f database/local-vault/step2-session-feedback-trigger.local.sql

begin;

drop trigger if exists "session-feedback-admin-web-push" on public.session_feedback;

create trigger "session-feedback-admin-web-push"
after insert on public.session_feedback
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
