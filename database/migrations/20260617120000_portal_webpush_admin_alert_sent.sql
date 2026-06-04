-- Mirror of supabase/migrations/20260617120000_portal_webpush_admin_alert_sent.sql

begin;

create table if not exists public.portal_webpush_admin_alert_sent (
  source_table text not null,
  source_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

comment on table public.portal_webpush_admin_alert_sent is
  'Dedup ledger: portal-push-dispatch-admin-alert inserts before sending; service role only.';

alter table public.portal_webpush_admin_alert_sent enable row level security;

grant select, insert on public.portal_webpush_admin_alert_sent to service_role;

commit;
