-- Unpaid finish-booking holds (30 minutes) must leave the public seat.
-- The edge function existed, but nothing called it on a clock, so awaiting_payment
-- rows kept painting Fully booked after the window (Nasim Acton Sat 12.30).
-- Secret is copied from the live post-trial cron. Do not store it in git.

do $cron$
declare
  cmd text;
  secret text;
begin
  select command into cmd
  from cron.job
  where jobname = 'portal-post-trial-offers-10m'
  limit 1;

  if cmd is null then
    raise exception 'portal-post-trial-offers-10m cron is missing; cannot copy webhook secret';
  end if;

  secret := substring(cmd from 'x-portal-webhook-secret'', ''([^'']+)''');
  if secret is null or length(secret) < 8 then
    raise exception 'webhook secret not found on portal-post-trial-offers-10m';
  end if;

  begin
    perform cron.unschedule('portal-booking-pay-hold-2m');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-booking-pay-hold-2m',
    '*/2 * * * *',
    format($job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-cron-booking-pay-hold',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', %L
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
    $job$, secret)
  );
end
$cron$;
