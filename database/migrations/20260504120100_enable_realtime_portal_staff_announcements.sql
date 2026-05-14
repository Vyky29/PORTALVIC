-- Realtime: staff dashboard refreshes notices when admin inserts/updates portal_staff_announcements.
-- Run in Supabase SQL Editor after 20260504120000_portal_staff_announcements.sql.
-- Safe to re-run.

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
