-- CS Cliq standalone: leadership peer list for director/admin inboxes (SECURITY DEFINER).
-- Mirror: supabase/migrations/20260609190000_portal_cs_cliq_leadership_peers.sql

begin;

create or replace function public.portal_cs_cliq_leadership_peers()
returns table (
  id uuid,
  full_name text,
  username text,
  app_role text,
  staff_role text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select
    sp.id,
    sp.full_name,
    sp.username,
    sp.app_role,
    sp.staff_role,
    sp.is_active
  from public.staff_profiles sp
  where coalesce(sp.is_active, true)
    and sp.id <> (select auth.uid())
    and (
      lower(coalesce(sp.app_role, '')) in ('admin', 'ceo')
      or public.portal_staff_profile_is_director_dm_target(sp.id)
    )
  order by sp.full_name nulls last, sp.username nulls last;
$$;

comment on function public.portal_cs_cliq_leadership_peers() is
  'Director/admin DM peers for CS Cliq leadership inboxes. Callable by any authenticated portal user.';

revoke all on function public.portal_cs_cliq_leadership_peers() from public;
grant execute on function public.portal_cs_cliq_leadership_peers() to authenticated;

commit;
