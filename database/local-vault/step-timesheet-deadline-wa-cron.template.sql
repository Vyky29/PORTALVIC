-- Timesheet WhatsApp: 23:00 Europe/London on the 24th.
-- pg_cron is UTC. 23:00 London = 22:00 UTC (BST) or 23:00 UTC (GMT).
-- The function only sends when London day is 24 and hour is 23.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before running.

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
    perform cron.unschedule('portal-timesheet-deadline-whatsapp');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-timesheet-deadline-whatsapp',
    '0 22,23 24 * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-timesheet-deadline-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$
  );
end
$cron$;
