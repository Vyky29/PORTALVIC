-- Live staff/lead locations while portal app is open (admin map, ~10 m display radius).

begin;

create table if not exists public.portal_staff_live_locations (
  staff_user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  staff_display_name text not null default '',
  staff_surface text not null default 'staff',
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision not null default 25,
  heading double precision null,
  is_sharing boolean not null default true,
  constraint portal_staff_live_locations_lat_chk
    check (latitude >= -90 and latitude <= 90),
  constraint portal_staff_live_locations_lng_chk
    check (longitude >= -180 and longitude <= 180)
);

create index if not exists portal_staff_live_locations_updated_idx
  on public.portal_staff_live_locations (updated_at desc)
  where is_sharing = true;

alter table public.portal_staff_live_locations enable row level security;

grant select, insert, update on table public.portal_staff_live_locations to authenticated;

drop policy if exists portal_staff_live_locations_insert_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_insert_own
  on public.portal_staff_live_locations for insert to authenticated
  with check (staff_user_id = auth.uid() and public.portal_staff_is_staff_or_lead());

drop policy if exists portal_staff_live_locations_update_own on public.portal_staff_live_locations;
create policy portal_staff_live_locations_update_own
  on public.portal_staff_live_locations for update to authenticated
  using (staff_user_id = auth.uid() and public.portal_staff_is_staff_or_lead())
  with check (staff_user_id = auth.uid());

drop policy if exists portal_staff_live_locations_select_admin on public.portal_staff_live_locations;
create policy portal_staff_live_locations_select_admin
  on public.portal_staff_live_locations for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

commit;
