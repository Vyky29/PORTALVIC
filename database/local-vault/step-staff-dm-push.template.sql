-- Apply in Supabase SQL Editor (Portal cklpnwhlqsulpmkipmqb).
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET from Edge Function secrets.
-- Deploy first: supabase functions deploy portal-push-dispatch-staff-dm --no-verify-jwt

begin;

create table if not exists public.portal_webpush_staff_dm_sent (
  source_table text not null,
  source_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

comment on table public.portal_webpush_staff_dm_sent is
  'Dedup ledger: portal-push-dispatch-staff-dm inserts before sending; service role only.';

alter table public.portal_webpush_staff_dm_sent enable row level security;

grant select, insert on public.portal_webpush_staff_dm_sent to service_role;

drop trigger if exists "portal-staff-dm-worker-chat-push" on public.portal_staff_dm_messages;
create trigger "portal-staff-dm-worker-chat-push"
after insert on public.portal_staff_dm_messages
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-staff-dm',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '30000'
);

commit;
