-- Portal: 21:00 UTC digest cron (copy → step3-feedback-9pm-cron.local.sql and replace secret).
-- DO NOT commit step3-feedback-9pm-cron.local.sql (gitignored pattern: *.local.sql).
--
-- PowerShell:
--   Copy-Item database\local-vault\step3-feedback-9pm-cron.template.sql database\local-vault\step3-feedback-9pm-cron.local.sql
--   (edit .local.sql — replace __PORTAL_PUSH_WEBHOOK_SECRET__)
--   supabase db query --linked -f database/local-vault/step3-feedback-9pm-cron.local.sql

do $cron$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception 'pg_cron not enabled — run step1-extensions.sql or enable in Dashboard → Extensions';
  end if;

  begin
    perform cron.unschedule('portal-feedback-9pm-digest');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-feedback-9pm-digest',
    '0 21 * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-feedback-9pm-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PX5iZ7AIf2YslxGu1N9yjdmqzTpnv6HVR4woMK3kSJPEOFLt8USH_WEBHOOK_SECRET__'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
    $job$
  );
end
$cron$;
