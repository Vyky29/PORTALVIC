-- Own-arrangement prepaid buffer check — daily ~06:00 Europe/London.
-- pg_cron is UTC-only: fire at 05:00 and 06:00 UTC; Edge Function gates on London hour === 6.
--
-- Requires: pg_cron + pg_net enabled; Edge Function portal-cron-own-arrangement-buffer-check deployed.
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with the same secret as other portal crons.

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
    perform cron.unschedule('portal-own-arrangement-buffer-check');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-own-arrangement-buffer-check',
    '0 5,6 * * *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-cron-own-arrangement-buffer-check',
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
