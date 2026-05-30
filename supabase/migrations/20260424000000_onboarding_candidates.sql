-- Interview / onboarding portal (working_ui/Working_interview.html).
-- Rows: id = client-generated text PK (e.g. cand_<timestamp>_<rand>), data = full candidate document (jsonb).
-- Requires an authenticated Supabase session with a matching staff_profiles row (same pattern as timesheet / dashboards).

begin;

create table if not exists public.onboarding_candidates (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

comment on table public.onboarding_candidates is
  'Shared recruitment/onboarding records from the interview portal; UI state lives in data (jsonb).';

create index if not exists onboarding_candidates_updated_at_idx
  on public.onboarding_candidates (updated_at desc);

alter table public.onboarding_candidates replica identity full;

alter table public.onboarding_candidates enable row level security;

grant select, insert, update, delete on table public.onboarding_candidates to authenticated;

drop policy if exists "onboarding_candidates_select_team" on public.onboarding_candidates;
create policy "onboarding_candidates_select_team"
on public.onboarding_candidates
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

drop policy if exists "onboarding_candidates_insert_team" on public.onboarding_candidates;
create policy "onboarding_candidates_insert_team"
on public.onboarding_candidates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

drop policy if exists "onboarding_candidates_update_team" on public.onboarding_candidates;
create policy "onboarding_candidates_update_team"
on public.onboarding_candidates
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

drop policy if exists "onboarding_candidates_delete_team" on public.onboarding_candidates;
create policy "onboarding_candidates_delete_team"
on public.onboarding_candidates
for delete
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

do $pub$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'onboarding_candidates'
  ) then
    alter publication supabase_realtime add table public.onboarding_candidates;
  end if;
end
$pub$;

commit;
