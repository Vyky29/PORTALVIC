-- 09:00 London reminder when a refund is still open 3 days after the bank-details WhatsApp.
-- Cron is UTC. 08:00 and 09:00 UTC cover BST and GMT. The function only sends at London hour 9.
-- Secret is copied from the live makeup reminder cron. Do not store it in git.

do $cron$
declare
  cmd text;
  secret text;
begin
  select command into cmd
  from cron.job
  where jobname = 'portal-makeup-offer-reminder-8am'
  limit 1;

  if cmd is null then
    raise exception 'portal-makeup-offer-reminder-8am cron is missing; cannot copy webhook secret';
  end if;

  secret := substring(cmd from 'x-portal-webhook-secret'', ''([^'']+)''');
  if secret is null or length(secret) < 8 then
    raise exception 'webhook secret not found on portal-makeup-offer-reminder-8am';
  end if;

  begin
    perform cron.unschedule('portal-refund-bank-reminder-9am');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-refund-bank-reminder-9am',
    '0 8,9 * * *',
    format($job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-refund-bank-reminder-whatsapp',
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
