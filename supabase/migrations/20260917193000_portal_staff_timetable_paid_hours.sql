-- Timetable: optional paid hours per cell (empty = same as shift in raw_assignment).
begin;

alter table public.portal_staff_timetable_cells
  add column if not exists paid_hours text;

comment on column public.portal_staff_timetable_cells.paid_hours is
  'Paid band for this cell (e.g. 4-6). Empty/null = same as shift hours in raw_assignment.';

commit;
