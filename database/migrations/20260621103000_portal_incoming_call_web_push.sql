-- Web Push for live internal chat call invites (app closed / phone locked).
-- Replace __PORTAL_PUSH_WEBHOOK_SECRET__ with PORTAL_PUSH_WEBHOOK_SECRET from Edge secrets before applying.
-- Deploy Edge Function: portal-push-dispatch-incoming-call

begin;

create table if not exists public.portal_webpush_incoming_call_sent (
  source_table text not null,
  source_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

comment on table public.portal_webpush_incoming_call_sent is
  'Dedupe ledger: one Web Push per call-invite message row.';

alter table public.portal_webpush_incoming_call_sent enable row level security;

grant select, insert on public.portal_webpush_incoming_call_sent to service_role;

drop trigger if exists "portal-staff-dm-incoming-call-push" on public.portal_staff_dm_messages;
create trigger "portal-staff-dm-incoming-call-push"
after insert on public.portal_staff_dm_messages
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-incoming-call',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

drop trigger if exists "portal-ceo-group-incoming-call-push" on public.portal_ceo_group_message;
create trigger "portal-ceo-group-incoming-call-push"
after insert on public.portal_ceo_group_message
for each row
execute function supabase_functions.http_request(
  'https://cklpnwhlqsulpmkipmqb.supabase.co/functions/v1/portal-push-dispatch-incoming-call',
  'POST',
  '{"Content-Type":"application/json","x-portal-webhook-secret":"__PORTAL_PUSH_WEBHOOK_SECRET__"}',
  '{}',
  '5000'
);

commit;
