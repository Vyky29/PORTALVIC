-- Daily 20:30 Europe/London WhatsApp to staff with incomplete same-day feedback.
-- pg_cron is UTC-only: 19:30 UTC = 20:30 BST, 20:30 UTC = 20:30 GMT.
-- The Edge Function only sends when London hour is 20 and minute is 25–40.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before running (apply-feedback-2030-wa-cron.mjs).

do $ext$
declare
  missing text[] := array[]::text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    missing := array_append(missing, 'pg_cron');
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    missing := array_append(missing, 'pg_net');
  end if;
  if array_length(missing, 1) > 0 then
    raise exception
      'Enable extension(s) in Dashboard first: %',
      array_to_string(missing, ', ');
  end if;
end
$ext$;

do $cron$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception
      'pg_cron is not enabled. Supabase Dashboard → Database → Extensions → enable pg_cron and pg_net.';
  end if;

  begin
    perform cron.unschedule('portal-feedback-2030-whatsapp');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-feedback-2030-whatsapp',
    '30 19,20 * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );
end
$cron$;
