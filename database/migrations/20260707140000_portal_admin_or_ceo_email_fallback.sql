-- Ensure portal_staff_profile_is_admin_or_ceo grants corporate exec emails even when
-- staff_profiles.id is temporarily out of sync (matches achievement admin helper).

begin;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select
    public.portal_auth_email_is_achievement_admin()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and (
          sp.app_role in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha', 'victor', 'javi', 'javier', 'raul', 'palankas'
          )
        )
    );
$$;

commit;
