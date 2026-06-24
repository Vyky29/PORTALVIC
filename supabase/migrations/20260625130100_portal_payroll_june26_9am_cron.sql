-- June 2026 one-off: payroll report email to accountant at 09:00 London on the 26th
-- (not the 25th), so workers have until end of the 25th to submit after portal issues.
-- Replace __PAYROLL_CRON_SECRET__ before running in SQL Editor if not applied via CLI vault.
-- Requires pg_cron + pg_net; payroll-monthly-report Edge Function deployed.

begin;

do $cron$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception
      'pg_cron is not enabled. Supabase Dashboard → Database → Extensions → enable pg_cron and pg_net, then re-run.';
  end if;

  begin
    perform cron.unschedule('portal-payroll-monthly-25th');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-payroll-monthly-send');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('portal-payroll-june-2026-26th-9am');
  exception
    when others then null;
  end;

  -- 08:00 UTC = 09:00 London (BST) on 26 June 2026 only.
  perform cron.schedule(
    'portal-payroll-june-2026-26th-9am',
    '0 8 26 6 *',
    $job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/payroll-monthly-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-payroll-cron-secret', '__PAYROLL_CRON_SECRET__'
      ),
      body := '{"mode":"send","month":"2026-06"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $job$
  );
end
$cron$;

commit;
