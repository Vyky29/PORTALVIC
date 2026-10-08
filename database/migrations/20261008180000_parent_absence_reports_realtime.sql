-- Admin bell hears a parent-portal absent as soon as it is saved.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'portal_parent_absence_reports'
  ) then
    alter publication supabase_realtime add table public.portal_parent_absence_reports;
  end if;
end $$;
