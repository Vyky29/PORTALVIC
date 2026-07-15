-- Portal Supabase (cklpnwhlqsulpmkipmqb)
-- Canonical migration: database/migrations/20260617120000_staff_participant_access.sql
-- CLI: npm run apply:staff-participant-access

create table if not exists public.staff_participant_access (
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  participant_slug text not null check (
    participant_slug in ('ikram', 'serine', 'ayaan', 'emanuel')
  ),
  created_at timestamptz not null default now(),
  primary key (staff_id, participant_slug)
);

create index if not exists staff_participant_access_staff_id_idx
  on public.staff_participant_access (staff_id);

alter table public.staff_participant_access enable row level security;

-- Staff read own rows; ceo/admin read all (adjust if your RLS pattern differs)
drop policy if exists staff_participant_access_select_own on public.staff_participant_access;
create policy staff_participant_access_select_own
  on public.staff_participant_access
  for select
  to authenticated
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.is_active = true
        and lower(sp.app_role) in ('ceo', 'admin')
    )
  );

-- Example seed (replace UUIDs with real auth.users / staff_profiles.id):
-- insert into public.staff_participant_access (staff_id, participant_slug) values
--   ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'serine'),
--   ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'ayaan');
