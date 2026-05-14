-- Realtime: staff (and admin) refresh open DM when a message is inserted.
-- Apply after 20260510100000_portal_staff_internal_dm.sql.

ALTER TABLE public.portal_staff_dm_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'portal_staff_dm_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_staff_dm_messages;
  END IF;
END $$;
