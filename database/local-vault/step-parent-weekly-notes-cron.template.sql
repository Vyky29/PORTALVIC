-- Automated weekly notes → parent portal folder only (NO WhatsApp).
-- pg_cron is UTC-only; Edge Function gates on Europe/London hour/weekday.
--
--   1) Tuesday evening  → early_weekend (kids who only come Sat/Sun/Mon)
--   2) Saturday morning → cron (Tue–Fri-only + mixed start+end of week)
--
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ before apply (apply-parent-weekly-notes-cron.mjs).

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
    perform cron.unschedule('portal-parent-weekly-notes-weekend');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-parent-weekly-notes-midweek');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-parent-weekly-notes-saturday');
  exception
    when others then null;
  end;

  -- Tuesday 18:00 & 19:00 UTC → ~19–20 London (Sat/Sun/Mon-only cohort)
  perform cron.schedule(
    'portal-parent-weekly-notes-weekend',
    '0 18,19 * * 2',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-parent-weekly-notes-generate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"mode":"early_weekend","notify":false}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$
  );

  -- Saturday 07:00 & 08:00 UTC → Tue–Fri-only + mixed week catch-all
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
      body := '{"mode":"cron","notify":false}'::jsonb,
      timeout_milliseconds := 180000
    ) as request_id;
    $job$
  );
end
$cron$;
