-- Realtime for session disruption admin bell + Ops Hub badge.

begin;

alter table public.session_disruption_reports replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'session_disruption_reports'
     ) then
    alter publication supabase_realtime add table public.session_disruption_reports;
  end if;
end $$;

commit;
