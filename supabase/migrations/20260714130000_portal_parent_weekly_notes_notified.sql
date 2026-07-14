-- Track when a weekly note was pushed to the family (WhatsApp / portal message log).

begin;

alter table public.portal_parent_weekly_notes
  add column if not exists notified_at timestamptz null;

comment on column public.portal_parent_weekly_notes.notified_at is
  'When the family was notified (WhatsApp + notify_log). Null = ready in portal but not pushed yet.';

commit;
