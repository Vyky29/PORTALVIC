-- Realtime (postgres_changes) for staff/lead dashboards: auto-refresh roster when ops edits overrides.
-- Apply in Supabase: SQL Editor → Run, or `supabase db push` if you use the CLI linked to this project.
-- Safe to re-run: skips if the table is already in the publication.

ALTER TABLE public.schedule_overrides REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'schedule_overrides'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_overrides;
  END IF;
END $$;
