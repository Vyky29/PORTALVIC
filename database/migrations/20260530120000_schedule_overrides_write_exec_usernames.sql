-- Schedule overrides: allow portal CEOs/admins even when app_role row is stale.
-- Mirrors auth-handler PORTAL_USERNAME_ROLE_OVERRIDES (victor/javi/raul → ceo, sevitha → admin).

begin;

create or replace function public.portal_can_write_schedule_overrides()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
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

drop policy if exists "schedule_overrides_admin_ceo_all" on public.schedule_overrides;

create policy "schedule_overrides_admin_ceo_all"
on public.schedule_overrides
for all
to authenticated
using (public.portal_can_write_schedule_overrides())
with check (public.portal_can_write_schedule_overrides());

-- Audit log: same writers as parent overrides
drop policy if exists "schedule_override_events_admin_ceo_all" on public.schedule_override_events;

create policy "schedule_override_events_admin_ceo_all"
on public.schedule_override_events
for all
to authenticated
using (public.portal_can_write_schedule_overrides())
with check (public.portal_can_write_schedule_overrides());

commit;
