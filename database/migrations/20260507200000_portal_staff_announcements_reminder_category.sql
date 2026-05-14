-- Reminder sub-category for admin "Reminders" composer → staff quick menu
-- (Training / Timesheet / Notes). Requires public.portal_staff_announcements:
--   20260504120000_portal_staff_announcements.sql (and optional targets 20260508120000).

do $body$
begin
  if to_regclass('public.portal_staff_announcements') is null then
    raise notice 'portal_staff_announcements missing — apply 20260504120000_portal_staff_announcements.sql first; skipping reminder_category.';
    return;
  end if;

  execute $ddl$
    alter table public.portal_staff_announcements
      add column if not exists reminder_category text null
  $ddl$;

  execute $cmt$
    comment on column public.portal_staff_announcements.reminder_category is
      'When message_type is reminder: training | timesheet | notes; staff UI groups under Reminders.'
  $cmt$;

  execute 'alter table public.portal_staff_announcements drop constraint if exists portal_staff_announcements_reminder_category_check';

  execute $chk$
    alter table public.portal_staff_announcements
      add constraint portal_staff_announcements_reminder_category_check
      check (
        reminder_category is null
        or reminder_category in ('training', 'timesheet', 'notes')
      )
  $chk$;
end
$body$;
