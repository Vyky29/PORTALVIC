-- Backfill Tinashe absent Mon 29 Jun from Bismark quick mark (co-instructor John still saw Pending).
-- Run: npx supabase db query --linked -f database/local-vault/step-2026-06-29-tinashe-absent-feedback.sql

begin;

insert into public.session_feedback (
  submitted_by_user_id,
  feedback_role,
  portal_session_key,
  client_name,
  session_date,
  service,
  attendance,
  completed_by_name
)
select
  '09cc34eb-7824-4f54-b4a0-b2b3205425ca'::uuid,
  'staff',
  '2026-06-29|tinashe|bespoke_shared',
  'Tinashe',
  '2026-06-29'::date,
  'Bespoke Programme',
  'No',
  'Bismark Gyan'
where not exists (
  select 1
  from public.session_feedback sf
  where sf.session_date = '2026-06-29'::date
    and lower(trim(sf.client_name)) = 'tinashe'
    and lower(trim(coalesce(sf.attendance, ''))) in ('no', 'n')
);

commit;

select session_date, client_name, attendance, portal_session_key, completed_by_name, created_at
from public.session_feedback
where session_date = '2026-06-29'::date
  and lower(trim(client_name)) = 'tinashe';
