-- Mirror of database/migrations/20260504120000_portal_staff_announcements.sql for supabase db push.

begin;

create table if not exists public.portal_staff_announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  title text not null,
  body text not null,
  message_type text not null default 'announcement',
  priority text not null default 'normal',
  audience_scope text not null default 'all_staff',
  ends_at timestamptz null,
  constraint portal_staff_announcements_priority_check
    check (priority in ('normal', 'high', 'urgent')),
  constraint portal_staff_announcements_audience_scope_check
    check (audience_scope in ('all_staff', 'leads'))
);

comment on table public.portal_staff_announcements is
  'Internal notices from admin dashboard composer; staff_dashboard merges into notices when Supabase is ready.';

create index if not exists portal_staff_announcements_created_at_idx
  on public.portal_staff_announcements (created_at desc);

create index if not exists portal_staff_announcements_ends_at_idx
  on public.portal_staff_announcements (ends_at)
  where ends_at is not null;

alter table public.portal_staff_announcements enable row level security;

revoke all on public.portal_staff_announcements from public;
revoke all on public.portal_staff_announcements from anon;
grant select, insert on public.portal_staff_announcements to authenticated;

drop policy if exists "portal_staff_announcements_insert_admin_ceo" on public.portal_staff_announcements;
create policy "portal_staff_announcements_insert_admin_ceo"
  on public.portal_staff_announcements
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('admin', 'ceo')
    )
  );

drop policy if exists "portal_staff_announcements_select_admin_ceo" on public.portal_staff_announcements;
create policy "portal_staff_announcements_select_admin_ceo"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('admin', 'ceo')
    )
  );

drop policy if exists "portal_staff_announcements_select_staff_all" on public.portal_staff_announcements;
create policy "portal_staff_announcements_select_staff_all"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (
    audience_scope = 'all_staff'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role = 'staff'
    )
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "portal_staff_announcements_select_lead" on public.portal_staff_announcements;
create policy "portal_staff_announcements_select_lead"
  on public.portal_staff_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role = 'lead'
    )
    and (
      audience_scope = 'all_staff'
      or audience_scope = 'leads'
    )
    and (ends_at is null or ends_at >= now())
  );

commit;
