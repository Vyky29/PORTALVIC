-- Clear stale wellbeing bell notifications (test data / already handled check-ins).
-- https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/sql/new

-- OPTION A (recommended): mark ALL unread wellbeing notifications as read
update public.portal_wellbeing_admin_notifications
set read_at = now()
where read_at is null;

-- OPTION B: only auto-resolve where check-in is no longer awaiting 1-to-1
-- update public.portal_wellbeing_admin_notifications n
-- set read_at = now()
-- from public.portal_staff_wellbeing_checkins c
-- where n.checkin_id = c.id
--   and n.read_at is null
--   and (
--     c.has_concerns = false
--     or c.status not in ('needs_1to1', 'awaiting_1to1', 'in_progress')
--   );

-- Optional: close open test check-ins so Staff & HR list is clean
-- update public.portal_staff_wellbeing_checkins
-- set status = 'completed'
-- where has_concerns = true
--   and status in ('needs_1to1', 'awaiting_1to1', 'in_progress');
