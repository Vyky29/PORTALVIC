-- Portal login PINs (Staff / Lead / Admin portals).
--
-- Moves the hard-coded PIN roster out of the static admin_dashboard JS and into
-- an admin/CEO-only table so the codes are not readable from a public asset, and
-- so the "Sent" column can record when each PIN was handed out.
--
-- These are standalone roster rows (NOT tied to auth.users): some entries are
-- generic (e.g. "Admin", "Onboarding") and need not map to a real account.

begin;

create table if not exists public.portal_login_pins (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('staff', 'lead', 'admin')),
  display_order int not null default 0,
  name text not null,
  roles text not null default '',
  pin text not null,
  sent_at timestamptz null,
  sent_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal, name)
);

comment on table public.portal_login_pins is
  'Login PINs/passwords for the Staff/Lead/Admin portals. Admin+CEO only (RLS). Sent columns track when a code was handed out.';

create index if not exists portal_login_pins_portal_order_idx
  on public.portal_login_pins (portal, display_order);

create or replace function public.portal_login_pins_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_portal_login_pins_touch on public.portal_login_pins;
create trigger trg_portal_login_pins_touch
before update on public.portal_login_pins
for each row execute function public.portal_login_pins_touch_updated_at();

alter table public.portal_login_pins enable row level security;

grant select, insert, update, delete on table public.portal_login_pins to authenticated;

-- Admin/CEO only for everything (these are credentials; no "own row" access).
drop policy if exists "portal_login_pins_select_admin_ceo" on public.portal_login_pins;
create policy "portal_login_pins_select_admin_ceo"
on public.portal_login_pins
for select
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "portal_login_pins_insert_admin_ceo" on public.portal_login_pins;
create policy "portal_login_pins_insert_admin_ceo"
on public.portal_login_pins
for insert
to authenticated
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "portal_login_pins_update_admin_ceo" on public.portal_login_pins;
create policy "portal_login_pins_update_admin_ceo"
on public.portal_login_pins
for update
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "portal_login_pins_delete_admin_ceo" on public.portal_login_pins;
create policy "portal_login_pins_delete_admin_ceo"
on public.portal_login_pins
for delete
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

-- Seed the current roster. Idempotent: refresh roles/pin on conflict but keep
-- the existing sent_at/sent_by so re-running the migration never "un-sends".
insert into public.portal_login_pins (portal, display_order, name, roles, pin)
values
  ('staff',  1, 'Alex Stone',             'Climbing Instructor 3',                        '4827'),
  ('staff',  2, 'Berta Trapero Casado',   'Service Lead',                                 '3915'),
  ('staff',  3, 'Angel Falceto',          'Swimming Instructor 3',                        '7264'),
  ('staff',  4, 'Aurora Garcia',          'Swimming Instructor 3',                        '5183'),
  ('staff',  5, 'Dan Clarke',             'Swimming Instructor 3',                        '9027'),
  ('staff',  6, 'John Kyei-Fram',         'Service Lead',                                 '2641'),
  ('staff',  7, 'Bismark Gyan',           'Support Worker 3 · Climbing Instructor 3',     '6398'),
  ('staff',  8, 'Carlos Herrero',         'Climbing Instructor 3 · Support Worker 3',     '6815'),
  ('staff',  9, 'Andres Borrego',         'Climbing Instructor 3',                        '4726'),
  ('staff', 10, 'Javier Marquez',         'Swimming Instructor 3',                        '1750'),
  ('staff', 10, 'Roberto Reali',          'Swimming Instructor 2 · Support Worker 2',     '4592'),
  ('staff', 11, 'Youssef Moustafa',       'Swimming Instructor 2',                        '8163'),
  ('staff', 12, 'Giuseppe Morelli',       'Support Worker 2',                             '3074'),
  ('staff', 13, 'Simon Griffiths',        'Swimming Instructor 1',                        '7421'),
  ('staff', 14, 'Luliya',                 'Swimming Instructor 1 · Support Worker 1',     '5836'),
  ('staff', 15, 'Godsway Yatofo',         'Support Worker 1',                             '9268'),
  ('staff', 16, 'Sandra Bartolome',       'Fitness Instructor 2',                         '2497'),
  ('staff', 17, 'Michelle',               'Onboarding',                                   '5555'),
  ('staff', 18, 'Teflon',                 'Onboarding',                                   '1111'),
  ('staff', 19, 'Raul',                   'Manager',                                      '6184'),
  ('staff', 20, 'Sevitha',                'Admin',                                        '8847'),
  ('staff', 21, 'Javier Arranz Escorial', 'CEO',                                          '5293'),
  ('lead',   1, 'John Kyei-Fram',         'Service Lead',                                 '2641'),
  ('lead',   2, 'Berta Trapero Casado',   'Service Lead',                                 '3915'),
  ('lead',   3, 'Victor',                 'Manager',                                      '1212'),
  ('lead',   4, 'Admin',                  'Admin',                                        '1234'),
  ('lead',   5, 'Raul',                   'Manager',                                      '6184'),
  ('lead',   6, 'Sevitha',                'Admin',                                        '8847'),
  ('lead',   7, 'Javier Arranz Escorial', 'CEO',                                          '5293'),
  ('admin',  1, 'Victor',                 'Manager / Admin',                              '1212'),
  ('admin',  2, 'Admin',                  'Admin',                                        '1234'),
  ('admin',  3, 'Raul',                   'Manager',                                      '6184'),
  ('admin',  4, 'Sevitha',                'Admin',                                        '8847'),
  ('admin',  5, 'Javier Arranz Escorial', 'CEO',                                          '5293')
on conflict (portal, name) do update
  set display_order = excluded.display_order,
      roles = excluded.roles,
      pin = excluded.pin;

commit;
