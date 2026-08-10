-- Luliya: July timesheet is 25 Jun → 31 Jul (one sheet). August must be empty.
-- Wrong rows: duplicates + "25 Jul–24 Aug" stubs that only contain 27–31 Jul.
-- Also: trigger on UPDATE was rewriting period_month to August when office patched.

alter table public.staff_timesheets disable trigger user;

-- Canonical July sheet (113h / £2058 with SI 28 Jun 9–3)
update public.staff_timesheets
set
  period_month = '2026-07-01',
  submitted_on = '2026-07-31',
  is_late = false,
  penalty_amount = 0,
  net_cost = total_cost,
  status = 'submitted',
  role_label = 'Support Worker 1 · Swimming Instructor 1'
where id = 'b48f2566-8181-491d-8473-67f9f904307e'
  and submitted_by_user_id = 'a103a7cf-5984-42c1-bde7-17cba2938c2f';

-- Drop duplicates / August stubs for Luliya
delete from public.staff_timesheets
where submitted_by_user_id = 'a103a7cf-5984-42c1-bde7-17cba2938c2f'
  and id in (
    'fc4517f6-9342-43c2-8b03-07b25e736017', -- full Jul duplicate 112h
    '17c3f6b0-e017-4f6a-8a3e-f84911d0950a', -- partial to 24 Jul
    '6484eca0-6ff1-4b56-b358-a4dba3a99873', -- 27–31 Jul as August
    'c505ce3d-a3c2-4fc2-9271-fe41b1507814',
    'd1f32322-c065-40d2-874a-cf9b89dc7eae'
  );

alter table public.staff_timesheets enable trigger user;

-- Remove bogus August timesheet PDFs (keep May–June + 25 Jun–31 Jul)
delete from public.documents
where user_id = 'a103a7cf-5984-42c1-bde7-17cba2938c2f'
  and document_type = 'timesheet'
  and (
    title ilike '%25th July to 24th August%'
    or title ilike '%July to 24th August%'
    or (related_date = '2026-08-24' and title ilike '%timesheet%')
  );

select id, period_month::text, total_hours, total_cost, submitted_on::text, status
from public.staff_timesheets
where submitted_by_user_id = 'a103a7cf-5984-42c1-bde7-17cba2938c2f'
order by period_month;

select id, title, related_date::text
from public.documents
where user_id = 'a103a7cf-5984-42c1-bde7-17cba2938c2f'
  and document_type = 'timesheet'
order by related_date;
