-- Admin live map SELECT: match portal admin dashboard access (admin/ceo, manager, username overrides).

begin;

create or replace function public.portal_normalize_staff_key(raw text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      translate(
        coalesce(trim(raw), ''),
        'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaaeeeeiiiioooooouuuuncAAAAAAEEEEIIIIOOOOOOUUUUNC'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    )
  );
$$;

comment on function public.portal_normalize_staff_key(text) is
  'Lowercase alphanumeric staff key (username / first name / email local-part).';

create or replace function public.portal_profile_staff_key(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select coalesce(
    nullif(public.portal_normalize_staff_key(sp.username), ''),
    nullif(
      public.portal_normalize_staff_key(
        split_part(coalesce(sp.full_name, ''), ' ', 1)
      ),
      ''
    ),
    nullif(
      public.portal_normalize_staff_key(
        split_part(split_part(coalesce(u.email, ''), '@', 1), '+', 1)
      ),
      ''
    ),
    ''
  )
  from public.staff_profiles sp
  left join auth.users u on u.id = sp.id
  where sp.id = p_user_id
  limit 1;
$$;

revoke all on function public.portal_profile_staff_key(uuid) from public;
grant execute on function public.portal_profile_staff_key(uuid) to authenticated;

comment on function public.portal_profile_staff_key(uuid) is
  'Infer portal username key for RLS overrides (Victor, Raúl, Javi, Sevitha, etc.).';

create or replace function public.portal_staff_can_view_live_map()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security to off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and coalesce(sp.is_active, true)
      and (
        lower(coalesce(nullif(trim(sp.app_role), ''), '')) in ('admin', 'ceo')
        or lower(coalesce(nullif(trim(sp.staff_role), ''), '')) in ('manager', 'admin')
        or public.portal_profile_staff_key(sp.id) in (
          'sevitha',
          'victor',
          'javi',
          'javier',
          'raul'
        )
      )
  );
$$;

revoke all on function public.portal_staff_can_view_live_map() from public;
grant execute on function public.portal_staff_can_view_live_map() to authenticated;

comment on function public.portal_staff_can_view_live_map() is
  'Admin dashboard live map: admin/ceo, manager staff_role, or portal username overrides.';

drop policy if exists portal_staff_live_locations_select_admin on public.portal_staff_live_locations;

create policy portal_staff_live_locations_select_admin
  on public.portal_staff_live_locations
  for select
  to authenticated
  using (public.portal_staff_can_view_live_map());

commit;
