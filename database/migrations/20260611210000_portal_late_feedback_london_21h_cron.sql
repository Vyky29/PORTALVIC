-- Late-shift missing-feedback digest: always 21:00 Europe/London (GMT and BST).
-- pg_cron runs in UTC only, so schedule 20:00 and 21:00 UTC; the Edge Function
-- executes the digest only when the London wall-clock hour is 21.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before running in SQL Editor.

begin;

comment on table public.portal_webpush_feedback_9pm_sent is
  'Dedup ledger: one late-shift missing-feedback digest per shift calendar day (London); service role only.';

do $cron$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception
      'pg_cron is not enabled. Supabase Dashboard → Database → Extensions → enable pg_cron and pg_net, then re-run.';
  end if;

  begin
    perform cron.unschedule('portal-feedback-9pm-digest');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-9am-late-digest');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-late-digest');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-feedback-late-digest',
    '0 20,21 * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-feedback-9pm-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
    $job$
  );
end
$cron$;

commit;
