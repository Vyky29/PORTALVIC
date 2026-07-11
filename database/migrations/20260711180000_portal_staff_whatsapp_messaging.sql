-- Staff / leader WhatsApp threads (admin ↔ leaders). Separate from parent Family messages.

begin;

create table if not exists public.portal_staff_notify_log (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  sent_by_user_id       uuid references auth.users (id) on delete set null,
  sent_by_email         text,
  kind                  text not null default 'staff_message',
  channel               text not null default 'whatsapp',
  staff_profile_id      uuid references public.staff_profiles (id) on delete set null,
  staff_username        text,
  staff_display_name    text,
  staff_phone           text,
  subject               text,
  body_text             text not null,
  whatsapp_status       text,
  whatsapp_message_id   text,
  whatsapp_delivered_at timestamptz,
  whatsapp_read_at      timestamptz,
  error_detail          text,
  meta                  jsonb not null default '{}'::jsonb
);

comment on table public.portal_staff_notify_log is
  'Admin outbound WhatsApp to staff leaders (portal-staff-notify-send). Not mixed with parent notify log.';

create index if not exists portal_staff_notify_log_created_at_idx
  on public.portal_staff_notify_log (created_at desc);
create index if not exists portal_staff_notify_log_staff_id_idx
  on public.portal_staff_notify_log (staff_profile_id, created_at desc);
create index if not exists portal_staff_notify_log_wa_msg_idx
  on public.portal_staff_notify_log (whatsapp_message_id)
  where whatsapp_message_id is not null;
create index if not exists portal_staff_notify_log_phone_idx
  on public.portal_staff_notify_log (staff_phone);

create table if not exists public.portal_staff_whatsapp_inbound (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  wa_message_id     text not null unique,
  from_phone        text not null,
  staff_profile_id  uuid references public.staff_profiles (id) on delete set null,
  staff_username    text,
  contact_name      text,
  message_type      text not null default 'text',
  body_text         text,
  context_wa_id     text,
  media_path        text,
  media_mime        text,
  meta              jsonb not null default '{}'::jsonb,
  raw_payload       jsonb
);

comment on table public.portal_staff_whatsapp_inbound is
  'Inbound WhatsApp from staff leaders matched by phone to staff_profiles. Meta webhook routes here.';

create index if not exists portal_staff_whatsapp_inbound_created_at_idx
  on public.portal_staff_whatsapp_inbound (created_at desc);
create index if not exists portal_staff_whatsapp_inbound_from_phone_idx
  on public.portal_staff_whatsapp_inbound (from_phone);
create index if not exists portal_staff_whatsapp_inbound_staff_id_idx
  on public.portal_staff_whatsapp_inbound (staff_profile_id, created_at desc);

alter table public.portal_staff_notify_log enable row level security;
alter table public.portal_staff_whatsapp_inbound enable row level security;

drop policy if exists portal_staff_notify_log_select_admin
  on public.portal_staff_notify_log;
create policy portal_staff_notify_log_select_admin
  on public.portal_staff_notify_log
  for select
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

drop policy if exists portal_staff_notify_log_select_own
  on public.portal_staff_notify_log;
create policy portal_staff_notify_log_select_own
  on public.portal_staff_notify_log
  for select
  to authenticated
  using (staff_profile_id = auth.uid());

drop policy if exists portal_staff_whatsapp_inbound_select_admin
  on public.portal_staff_whatsapp_inbound;
create policy portal_staff_whatsapp_inbound_select_admin
  on public.portal_staff_whatsapp_inbound
  for select
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

drop policy if exists portal_staff_whatsapp_inbound_select_own
  on public.portal_staff_whatsapp_inbound;
create policy portal_staff_whatsapp_inbound_select_own
  on public.portal_staff_whatsapp_inbound
  for select
  to authenticated
  using (staff_profile_id = auth.uid());

grant select on public.portal_staff_notify_log to authenticated;
grant select, insert, update on public.portal_staff_notify_log to service_role;
grant select on public.portal_staff_whatsapp_inbound to authenticated;
grant select, insert, update on public.portal_staff_whatsapp_inbound to service_role;

-- Leaders eligible for staff WhatsApp portal channel (username key, lowercased).
create or replace function public.portal_staff_whatsapp_leader_keys()
returns text[]
language sql
immutable
as $$
  select array['berta','john','michelle','raul','victor','javi'];
$$;

comment on function public.portal_staff_whatsapp_leader_keys() is
  'Canonical staff username keys allowed on the leader WhatsApp channel.';

-- Normalize Raúl phone to E.164 when stored as UK local 07…
update public.staff_profiles
set phone_e164 = '+447516121702'
where lower(username) = 'raul'
  and (
    phone_e164 is null
    or regexp_replace(phone_e164, '\D', '', 'g') in ('07516121702', '7516121702', '447516121702')
  );

commit;
