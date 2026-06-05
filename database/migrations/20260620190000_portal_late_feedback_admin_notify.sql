-- Late session feedback: no staff approval gate; admin Web Push when late feedback is saved + 9pm missing digest.
-- Apply in Portal Supabase. Configure Database Webhook INSERT on session_feedback → portal-push-dispatch-admin-alert.
-- Schedule 21:00 Europe/London cron → portal-push-feedback-9pm-digest (see function header).

begin;

create table if not exists public.portal_webpush_feedback_9pm_sent (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  digest_date date not null,
  missing_count int not null default 0,
  constraint portal_webpush_feedback_9pm_sent_date_uidx unique (digest_date)
);

comment on table public.portal_webpush_feedback_9pm_sent is
  'Dedup ledger: one 9pm missing-feedback digest per London calendar day; service role only.';

alter table public.portal_webpush_feedback_9pm_sent enable row level security;

grant select, insert on public.portal_webpush_feedback_9pm_sent to service_role;

commit;
