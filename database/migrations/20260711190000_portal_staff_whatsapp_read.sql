-- Mirror: supabase/migrations/20260711190000_portal_staff_whatsapp_read.sql
-- Staff / leader WhatsApp: read cursor for unread club→leader messages in Alerts.

begin;

create table if not exists public.portal_staff_whatsapp_read (
  staff_profile_id uuid primary key references public.staff_profiles (id) on delete cascade,
  read_at timestamptz not null default '1970-01-01'::timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.portal_staff_whatsapp_read is
  'Leader Portal WhatsApp inbox read cursor — outbound portal_staff_notify_log rows after read_at count as unread.';

alter table public.portal_staff_whatsapp_read enable row level security;
revoke all on public.portal_staff_whatsapp_read from public, anon, authenticated;
grant select, insert, update on public.portal_staff_whatsapp_read to service_role;

create or replace function public.portal_staff_whatsapp_mark_read(
  p_staff_profile_id uuid,
  p_read_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out timestamptz := coalesce(p_read_at, now());
begin
  if p_staff_profile_id is null then
    return v_out;
  end if;
  insert into public.portal_staff_whatsapp_read (staff_profile_id, read_at, updated_at)
  values (p_staff_profile_id, v_out, now())
  on conflict (staff_profile_id) do update
  set read_at = greatest(portal_staff_whatsapp_read.read_at, excluded.read_at),
      updated_at = now()
  returning read_at into v_out;
  return v_out;
end;
$$;

revoke all on function public.portal_staff_whatsapp_mark_read(uuid, timestamptz) from public;
grant execute on function public.portal_staff_whatsapp_mark_read(uuid, timestamptz) to service_role;

commit;
