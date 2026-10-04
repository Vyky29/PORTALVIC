-- Service-role settings. Values are not stored in git.
-- SwimFarm owner WhatsApp lives here as key swimfarm_owner_whatsapp.

begin;

create table if not exists public.portal_private_config (
  key text primary key,
  value text not null
);

alter table public.portal_private_config enable row level security;

grant select on table public.portal_private_config to service_role;

commit;
