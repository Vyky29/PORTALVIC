-- Enable RLS on unrestricted tables flagged by Security Advisor:
--   public.clients
--   public.sessions
--   public.announcements
--
-- Safe baseline:
-- - RLS ON
-- - SELECT allowed only for authenticated role
-- - No INSERT/UPDATE/DELETE policies added

begin;

-- Guard: fail fast if expected tables are missing.
do $$
begin
  if to_regclass('public.clients') is null then
    raise exception 'Missing table: public.clients';
  end if;
  if to_regclass('public.sessions') is null then
    raise exception 'Missing table: public.sessions';
  end if;
  if to_regclass('public.announcements') is null then
    raise exception 'Missing table: public.announcements';
  end if;
end;
$$;

-- 1) Enable RLS
alter table public.clients enable row level security;
alter table public.sessions enable row level security;
alter table public.announcements enable row level security;

-- 2) Ensure authenticated can SELECT (and anon cannot)
grant select on table public.clients to authenticated;
grant select on table public.sessions to authenticated;
grant select on table public.announcements to authenticated;

revoke select on table public.clients from anon;
revoke select on table public.sessions from anon;
revoke select on table public.announcements from anon;

-- 3) Optional hardening for write privileges (still blocked by lack of write policies)
revoke insert, update, delete on table public.clients from anon, authenticated;
revoke insert, update, delete on table public.sessions from anon, authenticated;
revoke insert, update, delete on table public.announcements from anon, authenticated;

-- 4) RLS policies: minimal SELECT for authenticated only
drop policy if exists "clients_select_authenticated" on public.clients;
create policy "clients_select_authenticated"
  on public.clients
  for select
  to authenticated
  using (true);

drop policy if exists "sessions_select_authenticated" on public.sessions;
create policy "sessions_select_authenticated"
  on public.sessions
  for select
  to authenticated
  using (true);

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
  on public.announcements
  for select
  to authenticated
  using (true);

commit;

