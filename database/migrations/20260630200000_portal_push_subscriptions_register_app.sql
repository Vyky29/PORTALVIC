-- Tag push subscriptions by app surface so dispatch can target portal only (not cs_cliq).
-- Existing rows stay 'legacy' until the worker re-opens staff/lead/admin portal and re-registers.

begin;

alter table public.portal_push_subscriptions
  add column if not exists register_app text not null default 'legacy';

alter table public.portal_push_subscriptions
  drop constraint if exists portal_push_subscriptions_register_app_check;

alter table public.portal_push_subscriptions
  add constraint portal_push_subscriptions_register_app_check
  check (register_app in ('portal', 'cs_cliq', 'legacy'));

comment on column public.portal_push_subscriptions.register_app is
  'portal = staff/lead/admin dashboard PWA; cs_cliq = deprecated CS Cliq app (not dispatched); legacy = pre-tag rows (not dispatched).';

create index if not exists portal_push_subscriptions_portal_user_idx
  on public.portal_push_subscriptions (user_id, updated_at desc)
  where register_app = 'portal';

commit;
