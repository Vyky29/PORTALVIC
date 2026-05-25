-- Hide signed announcements from worker UI after a configurable delay (minutes / hours / days).

begin;

alter table public.portal_staff_announcements
  add column if not exists hide_after_ack_amount integer null;

alter table public.portal_staff_announcements
  add column if not exists hide_after_ack_unit text null;

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_hide_after_ack_unit_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_hide_after_ack_unit_check
  check (
    hide_after_ack_unit is null
    or hide_after_ack_unit in ('minutes', 'hours', 'days')
  );

alter table public.portal_staff_announcements
  drop constraint if exists portal_staff_announcements_hide_after_ack_amount_check;

alter table public.portal_staff_announcements
  add constraint portal_staff_announcements_hide_after_ack_amount_check
  check (
    hide_after_ack_amount is null
    or hide_after_ack_amount > 0
  );

comment on column public.portal_staff_announcements.hide_after_ack_amount is
  'When set with hide_after_ack_unit, worker signed log hides this announcement after sign + duration.';

comment on column public.portal_staff_announcements.hide_after_ack_unit is
  'minutes | hours | days — paired with hide_after_ack_amount.';

commit;
