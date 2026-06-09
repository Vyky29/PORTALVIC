-- Pick up / drop off handovers (portal-pickup.html, admin dashboard live list).

begin;

create table if not exists public.daily_handover_logs (
  id text primary key,
  participant_name text not null,
  session_date date not null,
  updated_at timestamptz not null default now(),
  locked boolean not null default false,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.daily_handover_logs is
  'Daily participant drop-off and pick-up handovers. Form payload lives in values (jsonb). id is client-generated: YYYY-MM-DD__participant-slug.';

create index if not exists daily_handover_logs_session_date_idx
  on public.daily_handover_logs (session_date desc);

create index if not exists daily_handover_logs_updated_at_idx
  on public.daily_handover_logs (updated_at desc);

alter table public.daily_handover_logs enable row level security;

grant select, insert, update, delete on table public.daily_handover_logs to authenticated;

drop policy if exists "daily_handover_logs_staff_rw" on public.daily_handover_logs;
create policy "daily_handover_logs_staff_rw"
on public.daily_handover_logs
for all
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

alter table public.daily_handover_logs replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'daily_handover_logs'
     ) then
    alter publication supabase_realtime add table public.daily_handover_logs;
  end if;
end $$;

commit;
