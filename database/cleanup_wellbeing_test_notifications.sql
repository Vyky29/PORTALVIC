-- One-off: clear old wellbeing bell notifications from testing.
-- Run in Supabase SQL Editor if the admin bell still shows stale test alerts.
-- https://supabase.com/dashboard/project/cklpnwhlqsulpmkipmqb/sql/new

-- Mark read: notifications for check-ins no longer awaiting a 1-to-1
update public.portal_wellbeing_admin_notifications n
set read_at = now()
from public.portal_staff_wellbeing_checkins c
where n.checkin_id = c.id
  and n.read_at is null
  and (
    c.has_concerns = false
    or c.status not in ('needs_1to1', 'awaiting_1to1', 'in_progress')
  );

-- Optional: mark ALL unread wellbeing notifications as read (uncomment if needed)
-- update public.portal_wellbeing_admin_notifications
-- set read_at = now()
-- where read_at is null;
