-- Reminder sub-category for staff quick menu (Training / Timesheet / Notes).

begin;

alter table public.portal_staff_announcements
  add column if not exists reminder_category text null;

comment on column public.portal_staff_announcements.reminder_category is
  'When message_type is reminder: training | timesheet | notes; staff UI groups under Reminders.';

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_reminder_category_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_reminder_category_check
  check (
    reminder_category is null
    or reminder_category in ('training', 'timesheet', 'notes')
  );

commit;
