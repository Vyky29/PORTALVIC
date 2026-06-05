-- Late session feedback admin push: SQL trigger + 21:00 digest cron.
-- Apply in Portal Supabase SQL Editor (cklpnwhlqsulpmkipmqb).
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with Edge secret PORTAL_PUSH_WEBHOOK_SECRET (same as roster trigger).
--
-- Requires: portal-push-dispatch-admin-alert + portal-push-feedback-9pm-digest deployed.
-- Also run: 20260620190000_portal_late_feedback_admin_notify.sql (dedupe table).

begin;

-- INSERT session_feedback → admin Web Push when feedback is late (function filters non-late rows).
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

-- Cron: 21:00 UTC ≈ 21:00 London (GMT). In BST (summer) fires at 22:00 London — adjust to 0 20 * * * if needed.
-- Unschedule first when re-applying (ignore error if job does not exist).
do $cron$
begin
  perform cron.unschedule('portal-feedback-9pm-digest');
exception
  when others then null;
end
$cron$;

select cron.schedule(
  'portal-feedback-9pm-digest',
  '0 21 * * *',
  $$
  select net.http_post(
    url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-feedback-9pm-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
