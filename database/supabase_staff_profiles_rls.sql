-- Fix "Could not load your profile" during login.
-- Cause: RLS/policies on public.staff_profiles block SELECT for authenticated users.
-- This enables RLS and keeps a safe policy for login profile reads.
-- NOTE: avoid self-referencing admin policy here; it can cause recursion.

begin;

-- Make sure RLS is on (Supabase often enables it by default)
alter table public.staff_profiles enable row level security;

-- Drop/recreate to avoid duplicates
drop policy if exists "staff can read own profile" on public.staff_profiles;
create policy "staff can read own profile"
on public.staff_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "admin can read all staff profiles" on public.staff_profiles;
-- Intentionally not recreated to prevent infinite recursion on staff_profiles.

commit;
