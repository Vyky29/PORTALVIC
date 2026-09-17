-- Absence / cancellation decision queue: same table, case_kind distinguishes proof absences
-- from club/admin cancellations that still need credit / refund / makeup decision.

alter table public.portal_parent_absence_reports
  add column if not exists case_kind text not null default 'absence';

alter table public.portal_parent_absence_reports
  drop constraint if exists portal_parent_absence_reports_case_kind_check;

alter table public.portal_parent_absence_reports
  add constraint portal_parent_absence_reports_case_kind_check
  check (case_kind in ('absence', 'cancellation'));

comment on column public.portal_parent_absence_reports.case_kind is
  'absence = parent/instructor missed (proof path). cancellation = club/admin cancelled session awaiting credit/refund/makeup decision (no proof required).';

create index if not exists portal_parent_absence_reports_case_kind_idx
  on public.portal_parent_absence_reports (case_kind, status, created_at desc);
