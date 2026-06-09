-- Chat Web Push triggers (DM + CEO group → admin/CEO devices when app closed).
-- Copy → step-chat-admin-push.local.sql, replace __PORTAL_PUSH_WEBHOOK_SECRET__,
-- run in Supabase SQL Editor after deploying portal-push-dispatch-admin-alert.

begin;

create table if not exists public.portal_webpush_admin_alert_sent (
  source_table text not null,
  source_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

alter table public.portal_webpush_admin_alert_sent enable row level security;
grant select, insert on public.portal_webpush_admin_alert_sent to service_role;

drop trigger if exists "portal-staff-dm-admin-chat-push" on public.portal_staff_dm_messages;
create trigger "portal-staff-dm-admin-chat-push"
after insert on public.portal_staff_dm_messages
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

drop trigger if exists "portal-ceo-group-admin-chat-push" on public.portal_ceo_group_message;
create trigger "portal-ceo-group-admin-chat-push"
after insert on public.portal_ceo_group_message
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-admin-alert',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
