-- Dedupe ledger for announcement Web Push (so notices reach staff when the app is closed).
-- Mirrors portal_webpush_override_sent. Requires 20260430140000_portal_web_push.sql
-- and 20260504120000_portal_staff_announcements.sql.
--
-- Deploy: see supabase/functions/portal-push-dispatch-announcement/index.ts header.
-- After apply: deploy that function and add a Database Webhook on
-- portal_staff_announcements (INSERT) → the function URL with x-portal-webhook-secret.

begin;

-- At most one web push per announcement row.
create table if not exists public.portal_webpush_announcement_sent (
  announcement_id uuid primary key
    references public.portal_staff_announcements (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.portal_webpush_announcement_sent is
  'Dedup ledger: portal-push-dispatch-announcement inserts before sending; service role only.';

alter table public.portal_webpush_announcement_sent enable row level security;

grant select, insert on public.portal_webpush_announcement_sent to service_role;

commit;
