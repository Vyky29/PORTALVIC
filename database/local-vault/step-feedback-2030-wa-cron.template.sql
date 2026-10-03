-- Feedback WhatsApp, London: Mon-Fri 20:00 then 20:30; Sunday 18:00 then 18:30; Saturday 15:00 then 15:30.
-- pg_cron is UTC-only. The Edge Function only sends in the matching London window unless force=true.
--   Mon-Fri 20:00 London = 19:00 UTC (BST) / 20:00 UTC (GMT)
--   Mon-Fri 20:30 London = 19:30 UTC (BST) / 20:30 UTC (GMT)
--   Sunday 18:00 London = 17:00 UTC (BST) / 18:00 UTC (GMT)
--   Sunday 18:30 London = 17:30 UTC (BST) / 18:30 UTC (GMT)
--   Saturday 15:00 London = 14:00 UTC (BST) / 15:00 UTC (GMT)
--   Saturday 15:30 London = 14:30 UTC (BST) / 15:30 UTC (GMT)
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

  begin
    perform cron.unschedule('portal-feedback-2000-whatsapp');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-2000-whatsapp-weekend');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-2030-whatsapp-weekend');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-2000-whatsapp-sunday');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-feedback-2030-whatsapp-sunday');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-feedback-2000-whatsapp',
    '0 19,20 * * 1-5',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2000"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );

  perform cron.schedule(
    'portal-feedback-2030-whatsapp',
    '30 19,20 * * 1-5',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2030"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );

  perform cron.schedule(
    'portal-feedback-2000-whatsapp-sunday',
    '0 17,18 * * 0',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2000"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );

  perform cron.schedule(
    'portal-feedback-2030-whatsapp-sunday',
    '30 17,18 * * 0',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2030"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );

  perform cron.schedule(
    'portal-feedback-2000-whatsapp-weekend',
    '0 14,15 * * 6',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2000"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );

  perform cron.schedule(
    'portal-feedback-2030-whatsapp-weekend',
    '30 14,15 * * 6',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-feedback-2030-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', '__PORTAL_PUSH_WEBHOOK_SECRET__'
      ),
      body := '{"wave":"2030"}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$
  );
end
$cron$;
