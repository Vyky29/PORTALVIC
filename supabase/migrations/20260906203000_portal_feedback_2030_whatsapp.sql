-- 20:30 Europe/London WhatsApp nudge: staff with same-day session feedback still open.
-- Dedup one message per staff per London calendar day.

begin;

create table if not exists public.portal_feedback_2030_wa_sent (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_date date not null,
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  pending_count int not null default 0,
  constraint portal_feedback_2030_wa_sent_uidx unique (session_date, staff_user_id)
);

comment on table public.portal_feedback_2030_wa_sent is
  'Dedup ledger: one 20:30 outstanding-feedback WhatsApp per staff per London session day; service role only.';

create index if not exists portal_feedback_2030_wa_sent_date_idx
  on public.portal_feedback_2030_wa_sent (session_date desc);

alter table public.portal_feedback_2030_wa_sent enable row level security;

grant select, insert on public.portal_feedback_2030_wa_sent to service_role;

commit;
