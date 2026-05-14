-- Mirror of database/migrations/20260504120100_enable_realtime_portal_staff_announcements.sql

ALTER TABLE public.portal_staff_announcements REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'portal_staff_announcements'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_staff_announcements;
  END IF;
END $$;
