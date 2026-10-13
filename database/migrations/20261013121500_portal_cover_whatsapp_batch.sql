-- Hold cover WhatsApps for one quiet minute, then send one message per instructor and day.
-- Cron is every minute. The edge function only sends batches whose quiet minute has passed.

create table if not exists public.portal_cover_whatsapp_batch (
  id uuid primary key default gen_random_uuid(),
  roster_key text not null,
  session_date date not null,
  direction text not null,
  send_after timestamptz not null,
  override_ids uuid[] not null default '{}',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_cover_whatsapp_batch_direction_chk
    check (direction in ('assigned', 'removed')),
  constraint portal_cover_whatsapp_batch_status_chk
    check (status in ('pending', 'sending', 'sent'))
);

create unique index if not exists portal_cover_whatsapp_batch_open_idx
  on public.portal_cover_whatsapp_batch (roster_key, session_date, direction)
  where status = 'pending';

comment on table public.portal_cover_whatsapp_batch is
  'Cover WhatsApp debounce. Another override for the same instructor and day resets send_after. One message after a quiet minute.';

alter table public.portal_cover_whatsapp_batch enable row level security;
revoke all on public.portal_cover_whatsapp_batch from public, anon, authenticated;
grant select, insert, update, delete on public.portal_cover_whatsapp_batch to service_role;

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
    perform cron.unschedule('portal-cover-whatsapp-batch-flush');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'portal-cover-whatsapp-batch-flush',
    '* * * * *',
    format($job$
    select net.http_post(
      url := 'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-schedule-override',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-portal-webhook-secret', %L
      ),
      body := '{"action":"flush_cover_batches"}'::jsonb
    );
    $job$, secret)
  );
end
$cron$;
