-- Log of funder invoice emails to admin@, and the London-morning job
-- that sends NHS at 9am London on the 20th and H&F + NHS/ILA at 9am on the 25th.
-- 08:00 and 09:00 UTC cover 9am London in summer and winter. The function only sends at 9am London.
-- Secret is copied from a live portal cron. Do not store it in git.

create table if not exists public.portal_funder_invoice_mail_log (
  id uuid primary key default gen_random_uuid(),
  ym text not null,
  pack text not null check (pack in ('hf', 'nhs', 'nhs_ila')),
  sent_to text not null,
  invoice_numbers text[] not null default '{}',
  sent_at timestamptz not null default now(),
  unique (ym, pack)
);

alter table public.portal_funder_invoice_mail_log enable row level security;

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
    select command into cmd
    from cron.job
    where jobname = 'portal-post-trial-offers-10m'
    limit 1;
  end if;

  if cmd is null then
    raise exception 'portal cron is missing; cannot copy webhook secret';
  end if;

  secret := substring(cmd from 'x-portal-webhook-secret'', ''([^'']+)''');
  if secret is null or length(secret) < 8 then
    raise exception 'webhook secret not found on live portal cron';
  end if;

  begin
    perform cron.unschedule('portal-funder-invoice-mail-daily');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-funder-invoice-mail-daily',
    '0 8,9 * * *',
    format($job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-cron-funder-invoice-mail',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', %L
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$, secret)
  );
end
$cron$;
