-- Schedule & Cover write permissions (Victor / Raul / Javi / Sevitha + admin/ceo app_role).
-- Safe to re-run. Apply on Portal cklpnwhlqsulpmkipmqb.

begin;

grant select, insert, update, delete on public.schedule_overrides to authenticated;
grant select, insert on public.schedule_override_events to authenticated;

create or replace function public.portal_can_write_schedule_overrides()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and (
        lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
        or lower(coalesce(sp.username, '')) in ('victor', 'javi', 'raul', 'sevitha')
        or lower(split_part(trim(coalesce(sp.full_name, '')), ' ', 1)) in ('victor', 'javi', 'raul', 'sevitha')
      )
  );
$$;

comment on function public.portal_can_write_schedule_overrides() is
  'True when the signed-in user may insert/update schedule_overrides (admin/ceo app_role or portal exec usernames).';

revoke all on function public.portal_can_write_schedule_overrides() from public;
grant execute on function public.portal_can_write_schedule_overrides() to authenticated;

alter table public.schedule_overrides enable row level security;
alter table public.schedule_override_events enable row level security;

drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;
create policy "schedule_overrides_admin_ceo_all"
on public.schedule_overrides
for all
to authenticated
using (public.portal_can_write_schedule_overrides())
with check (public.portal_can_write_schedule_overrides());

drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;
create policy "schedule_override_events_admin_ceo_all"
on public.schedule_override_events
for all
to authenticated
using (public.portal_can_write_schedule_overrides())
with check (public.portal_can_write_schedule_overrides());

commit;
