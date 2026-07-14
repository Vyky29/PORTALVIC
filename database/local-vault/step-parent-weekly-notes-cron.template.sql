-- Automated weekly notes: generate + WhatsApp notify (no admin click).
-- pg_cron is UTC-only; Edge Function gates on Europe/London hour/weekday.
--
-- Jobs:
--   1) Weekday evenings Tue–Fri ~20:00 London → early (Mon–Wed-only kids)
--   2) Saturday morning ~09:00 London → full week that just ended
--
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before apply (see apply-parent-weekly-notes-cron.mjs).

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
    perform cron.unschedule('portal-parent-weekly-notes-early');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-parent-weekly-notes-saturday');
  exception
    when others then null;
  end;

  -- Tue–Fri 18:00 & 19:00 UTC → covers ~19–20 London (BST/GMT)
  perform cron.schedule(
    'portal-parent-weekly-notes-early',
    '0 18,19 * * 2-5',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-parent-weekly-notes-generate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"mode":"early"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$
  );

  -- Saturday 07:00 & 08:00 UTC → covers ~08–09 London
  perform cron.schedule(
    'portal-parent-weekly-notes-saturday',
    '0 7,8 * * 6',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-parent-weekly-notes-generate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"mode":"cron"}'::jsonb,
      timeout_milliseconds := 180000
    ) as request_id;
    $job$
  );
end
$cron$;
