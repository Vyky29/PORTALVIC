-- Web Push: per-device subscriptions + one-shot delivery log for roster overrides.
--
-- Deploy checklist:
-- 1) Run this migration + 20260430140100_portal_push_session_horizon.sql (requires public.schedule_overrides).
-- 2) `npx web-push generate-vapid-keys` → set Edge secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
-- 3) Edge secrets: PORTAL_PUSH_OPEN_URL = full HTTPS URL to staff_dashboard (e.g. …/staff_dashboard.html, no query).
-- 4) Edge secrets: PORTAL_PUSH_WEBHOOK_SECRET = long random string.
-- 5) Deploy functions: portal-push-subscribe, portal-push-dispatch-schedule-override.
-- 6) Supabase Dashboard → Database → Webhooks: table schedule_overrides, events INSERT (and UPDATE if needed),
--    URL https://<ref>.supabase.co/functions/v1/portal-push-dispatch-schedule-override,
--    HTTP header x-portal-webhook-secret: <PORTAL_PUSH_WEBHOOK_SECRET>.
-- 7) On the WordPress/host page that loads staff_dashboard, set window.__PORTAL_VAPID_PUBLIC_KEY__ to the same
--    public key as VAPID_PUBLIC_KEY (base64 string). Re-upload database/supabase-client.js with the new ?v= cache buster.

begin;

create table if not exists public.portal_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  subscription_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_push_subscriptions_endpoint_nonempty check (length(trim(endpoint)) > 0)
);

create unique index if not exists portal_push_subscriptions_user_endpoint_uidx
  on public.portal_push_subscriptions (user_id, endpoint);

comment on table public.portal_push_subscriptions is
  'Browser Web Push subscriptions (PushManager); rows upserted from portal-push-subscribe Edge Function.';

alter table public.portal_push_subscriptions enable row level security;

drop policy if exists "portal_push_subscriptions_select_own" on public.portal_push_subscriptions;
create policy "portal_push_subscriptions_select_own"
  on public.portal_push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "portal_push_subscriptions_insert_own" on public.portal_push_subscriptions;
create policy "portal_push_subscriptions_insert_own"
  on public.portal_push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "portal_push_subscriptions_update_own" on public.portal_push_subscriptions;
create policy "portal_push_subscriptions_update_own"
  on public.portal_push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "portal_push_subscriptions_delete_own" on public.portal_push_subscriptions;
create policy "portal_push_subscriptions_delete_own"
  on public.portal_push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.portal_push_subscriptions to authenticated;

-- At most one web push per schedule_overrides row (avoids duplicate sends on UPDATE webhooks).
create table if not exists public.portal_webpush_override_sent (
  override_id uuid primary key references public.schedule_overrides (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.portal_webpush_override_sent is
  'Dedup ledger: portal-push-dispatch-schedule-override inserts before sending; service role only.';

alter table public.portal_webpush_override_sent enable row level security;

grant select, insert on public.portal_webpush_override_sent to service_role;

commit;
