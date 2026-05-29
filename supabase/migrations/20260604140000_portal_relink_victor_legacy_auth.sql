-- Consolidate Victor's duplicate Auth identity into the active CEO account.
--   old (victor_legacy, inactive): 74408821-5524-41ea-b4b6-a30b4f40522f
--   new (victor, active, ceo):     a0d439df-3a8f-439d-b427-b3459552eae1
--
-- schedule_overrides has a BEFORE UPDATE trigger that sets updated_by := auth.uid();
-- in the SQL editor auth.uid() is null, so the generic relink update would violate the
-- NOT NULL on updated_by. The schedule data under the legacy account is test data, so we
-- delete its audit events + overrides first, then relink the rest (session_feedback, etc.).
-- Run on Portal Supabase (cklpnwhlqsulpmkipmqb) in SQL Editor.

begin;

-- 1) Test schedule-override audit events tied to the legacy account or its overrides.
--    (events.override_id is ON DELETE RESTRICT, and events.actor_id -> auth.users.)
delete from public.schedule_override_events
where actor_id = '74408821-5524-41ea-b4b6-a30b4f40522f'
   or override_id in (
        select id
        from public.schedule_overrides
        where created_by = '74408821-5524-41ea-b4b6-a30b4f40522f'
           or updated_by = '74408821-5524-41ea-b4b6-a30b4f40522f'
     );

-- 2) Test schedule overrides created/updated by the legacy account.
delete from public.schedule_overrides
where created_by = '74408821-5524-41ea-b4b6-a30b4f40522f'
   or updated_by = '74408821-5524-41ea-b4b6-a30b4f40522f';

-- 3) Reassign every remaining auth.users FK (session_feedback, reports, finance, portal)
--    from the legacy id to the active CEO id.
select public._portal_relink_auth_user_fks(
  '74408821-5524-41ea-b4b6-a30b4f40522f',
  'a0d439df-3a8f-439d-b427-b3459552eae1'
);

-- 4) Remove the legacy profile row, then the legacy Auth user.
delete from public.staff_profiles where id = '74408821-5524-41ea-b4b6-a30b4f40522f';
delete from auth.users          where id = '74408821-5524-41ea-b4b6-a30b4f40522f';

commit;
