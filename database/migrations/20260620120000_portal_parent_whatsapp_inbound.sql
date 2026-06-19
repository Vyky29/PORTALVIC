-- Mirror of supabase/migrations/20260620120000_portal_parent_whatsapp_inbound.sql

begin;

create table if not exists public.portal_parent_whatsapp_inbound (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  wa_message_id   text not null unique,
  from_phone      text not null,
  contact_name    text,
  message_type    text not null default 'text',
  body_text       text,
  context_wa_id   text,
  meta            jsonb not null default '{}'::jsonb,
  raw_payload     jsonb
);

comment on table public.portal_parent_whatsapp_inbound is
  'Inbound WhatsApp messages to the portal API number. Meta webhook inserts; portal admins select.';

create index if not exists portal_parent_whatsapp_inbound_created_at_idx
  on public.portal_parent_whatsapp_inbound (created_at desc);

create index if not exists portal_parent_whatsapp_inbound_from_phone_idx
  on public.portal_parent_whatsapp_inbound (from_phone);

alter table public.portal_parent_whatsapp_inbound enable row level security;

drop policy if exists portal_parent_whatsapp_inbound_select_admin
  on public.portal_parent_whatsapp_inbound;
create policy portal_parent_whatsapp_inbound_select_admin
  on public.portal_parent_whatsapp_inbound
  for select
  to authenticated
  using (public.portal_staff_profile_is_portal_admin());

grant select on public.portal_parent_whatsapp_inbound to authenticated;
grant select, insert on public.portal_parent_whatsapp_inbound to service_role;

commit;
