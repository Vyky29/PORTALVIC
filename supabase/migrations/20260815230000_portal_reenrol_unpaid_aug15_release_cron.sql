-- Auto-release unpaid Autumn first-payment seats after Sat 15 Aug 2026.
-- Europe/London midnight (00:00) on/after Sun 16 Aug → Edge Function runs.
-- pg_cron is UTC-only: fire at 23:00 and 00:00 UTC; function gates on London hour === 0.
--
-- Requires: pg_cron + pg_net; deploy portal-cron-reenrol-release-unpaid-aug15.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET.

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
    perform cron.unschedule('portal-reenrol-release-unpaid-aug15');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-reenrol-release-unpaid-aug15',
    '0 23,0 * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-cron-reenrol-release-unpaid-aug15',
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
