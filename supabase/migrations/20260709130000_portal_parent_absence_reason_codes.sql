-- Extend parent absence reports: reason codes + noted (non-missed) status.

alter table public.portal_parent_absence_reports
  add column if not exists reason_code text not null default '';

alter table public.portal_parent_absence_reports
  drop constraint if exists portal_parent_absence_reports_status_check;

alter table public.portal_parent_absence_reports
  add constraint portal_parent_absence_reports_status_check
  check (status in ('noted', 'missed', 'pending_review', 'excused', 'rejected', 'expired'));

comment on column public.portal_parent_absence_reports.reason_code is
  'other_commitments|party|holidays|travel|birthday|unwell — only unwell can become missed/pending_review.';

comment on table public.portal_parent_absence_reports is
  'Parent Absent: non-unwell reasons → noted (not Missed). Unwell without proof → missed; with proof → pending_review (admin validates).';
