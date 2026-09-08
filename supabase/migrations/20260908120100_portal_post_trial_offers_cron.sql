-- Post-trial offers cron every 10 minutes (UTC). Edge Function uses Europe/London for waves/EOD.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ when applying if not already scheduled in Dashboard.

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
  begin
    perform cron.unschedule('portal-post-trial-offers-10m');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-post-trial-offers-10m',
    '*/10 * * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-cron-post-trial-offers',
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
