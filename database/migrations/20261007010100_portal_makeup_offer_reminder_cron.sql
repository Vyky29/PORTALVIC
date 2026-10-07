-- 08:00 London reminder for a makeup still waiting on Accept or Decline.
-- Cron is UTC. 07:00 and 08:00 UTC cover BST and GMT. The function only sends at London hour 8.
-- Secret is copied from the live pay-hold cron. Do not store it in git.

do $cron$
declare
  cmd text;
  secret text;
begin
  select command into cmd
  from cron.job
  where jobname = 'portal-booking-pay-hold-2m'
  limit 1;

  if cmd is null then
    raise exception 'portal-booking-pay-hold-2m cron is missing; cannot copy webhook secret';
  end if;

  secret := substring(cmd from 'x-portal-webhook-secret'', ''([^'']+)''');
  if secret is null or length(secret) < 8 then
    raise exception 'webhook secret not found on portal-booking-pay-hold-2m';
  end if;

  begin
    perform cron.unschedule('portal-makeup-offer-reminder-8am');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-makeup-offer-reminder-8am',
    '0 7,8 * * *',
    format($job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-makeup-offer-reminder-whatsapp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', %L
      ),
      body := '{}'::jsonb
    );
    $job$, secret)
  );
end
$cron$;
