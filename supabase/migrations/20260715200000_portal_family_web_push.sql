-- Family portal Web Push: parent-keyed subscriptions + notify-log dedupe.
--
-- Deploy checklist:
-- 1) Run this migration on Portal (cklpnwhlqsulpmkipmqb).
-- 2) Reuse Edge secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PORTAL_PUSH_WEBHOOK_SECRET.
-- 3) Set PORTAL_PUSH_FAMILY_OPEN_URL (e.g. https://www.clubsensational.org/parent).
-- 4) Deploy: portal-push-subscribe-family, portal-push-dispatch-parent-notify, portal-parent-notify-send.

begin;

create table if not exists public.portal_family_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  parent_person_id text not null,
  endpoint text not null,
  subscription_json jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_family_push_subscriptions_endpoint_nonempty
    check (length(trim(endpoint)) > 0),
  constraint portal_family_push_subscriptions_parent_nonempty
    check (length(trim(parent_person_id)) > 0)
);

create unique index if not exists portal_family_push_subscriptions_parent_endpoint_uidx
  on public.portal_family_push_subscriptions (parent_person_id, endpoint);

create index if not exists portal_family_push_subscriptions_parent_idx
  on public.portal_family_push_subscriptions (parent_person_id);

comment on table public.portal_family_push_subscriptions is
  'Family PWA Web Push subscriptions keyed by parent_person_id; upserted from portal-push-subscribe-family.';

alter table public.portal_family_push_subscriptions enable row level security;

-- No public/authenticated RLS policies — Edge Functions use service_role only.
grant select, insert, update, delete on public.portal_family_push_subscriptions to service_role;

-- At most one web push per portal_parent_notify_log row.
create table if not exists public.portal_family_webpush_notify_sent (
  notify_log_id uuid primary key
    references public.portal_parent_notify_log (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.portal_family_webpush_notify_sent is
  'Dedup ledger: portal-push-dispatch-parent-notify inserts before sending; service role only.';

alter table public.portal_family_webpush_notify_sent enable row level security;

grant select, insert on public.portal_family_webpush_notify_sent to service_role;

commit;
