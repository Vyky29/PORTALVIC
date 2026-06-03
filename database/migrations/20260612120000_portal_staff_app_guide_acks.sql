-- Staff portal app guide: who marked the guide as read (admin visibility).

begin;

create table if not exists public.portal_staff_app_guide_acks (
  staff_id uuid primary key references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  staff_full_name text null,
  staff_username text null,
  guide_version text not null default '2026-06'
);

comment on table public.portal_staff_app_guide_acks is
  'One row per staff/lead when they mark portal_guide.html as read; visible to admin/CEO.';

create index if not exists portal_staff_app_guide_acks_read_at_idx
  on public.portal_staff_app_guide_acks (read_at desc);

alter table public.portal_staff_app_guide_acks enable row level security;

revoke all on public.portal_staff_app_guide_acks from public;
revoke all on public.portal_staff_app_guide_acks from anon;
grant select, insert, update on public.portal_staff_app_guide_acks to authenticated;

drop policy if exists "portal_staff_app_guide_acks_insert_own" on public.portal_staff_app_guide_acks;
create policy "portal_staff_app_guide_acks_insert_own"
  on public.portal_staff_app_guide_acks
  for insert
  to authenticated
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid() and sp.is_active is distinct from false
    )
  );

drop policy if exists "portal_staff_app_guide_acks_update_own" on public.portal_staff_app_guide_acks;
create policy "portal_staff_app_guide_acks_update_own"
  on public.portal_staff_app_guide_acks
  for update
  to authenticated
  using (staff_id = auth.uid())
  with check (staff_id = auth.uid());

drop policy if exists "portal_staff_app_guide_acks_select_own" on public.portal_staff_app_guide_acks;
create policy "portal_staff_app_guide_acks_select_own"
  on public.portal_staff_app_guide_acks
  for select
  to authenticated
  using (staff_id = auth.uid());

drop policy if exists "portal_staff_app_guide_acks_select_admin_ceo" on public.portal_staff_app_guide_acks;
create policy "portal_staff_app_guide_acks_select_admin_ceo"
  on public.portal_staff_app_guide_acks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('admin', 'ceo', 'manager')
    )
  );

commit;
