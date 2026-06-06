-- Mirror of supabase/migrations/20260622120000_portal_parent_notify_log.sql

begin;

create table if not exists public.portal_parent_notify_log (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  sent_by_user_id       uuid references auth.users (id) on delete set null,
  sent_by_email         text,
  kind                  text not null,
  channel               text not null,
  client_display        text,
  parent_name           text,
  parent_email          text,
  parent_phone          text,
  session_date          date,
  slot_id               text,
  venue                 text,
  subject               text,
  body_text             text,
  email_status          text,
  whatsapp_status       text,
  resend_id             text,
  whatsapp_message_id   text,
  error_detail          text,
  meta                  jsonb not null default '{}'::jsonb
);

comment on table public.portal_parent_notify_log is
  'Admin-sent parent/carer notifications (email/WhatsApp). Service role inserts; portal admins select.';

create index if not exists portal_parent_notify_log_created_at_idx
  on public.portal_parent_notify_log (created_at desc);

create index if not exists portal_parent_notify_log_client_display_idx
  on public.portal_parent_notify_log (client_display);

alter table public.portal_parent_notify_log enable row level security;

drop policy if exists portal_parent_notify_log_select_admin
  on public.portal_parent_notify_log;
create policy portal_parent_notify_log_select_admin
  on public.portal_parent_notify_log
  for select
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

grant select on public.portal_parent_notify_log to authenticated;
grant select, insert on public.portal_parent_notify_log to service_role;

commit;
