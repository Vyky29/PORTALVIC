-- Purge Emmanuel / Timi roster + feedback before their real start dates.
-- Emmanuel: from 2026-06-12 (Mon/Wed/Fri day centre). Timi: from 2026-06-15 (tentative).
-- Keeps May Timi history; drops false June term rows and Supabase roster overrides.

begin;

create temporary table _portal_early_emmanuel_timi_keys on commit drop as
select portal_session_key, session_date, client_name
from public.session_feedback
where (
  lower(trim(client_name)) = 'emmanuel'
  and session_date < '2026-06-12'
) or (
  lower(trim(client_name)) in ('timi', 'timmy')
  and session_date >= '2026-06-01'
  and session_date < '2026-06-15'
);

delete from public.portal_staff_session_quick_marks q
using _portal_early_emmanuel_timi_keys k
where q.portal_session_key = k.portal_session_key
  and q.session_date = k.session_date;

delete from public.session_feedback sf
using _portal_early_emmanuel_timi_keys k
where sf.portal_session_key = k.portal_session_key
  and sf.session_date = k.session_date;

delete from public.portal_roster_rows pr
where (
  lower(trim(pr.client_name)) = 'emmanuel'
  and (
    pr.session_date is null
    or pr.session_date < '2026-06-12'
  )
) or (
  lower(trim(pr.client_name)) in ('timi', 'timmy')
  and (
    pr.session_date is null
    or (pr.session_date >= '2026-06-01' and pr.session_date < '2026-06-15')
  )
);

delete from public.incident_reports
where lower(trim(client_name)) = 'emmanuel'
  and coalesce(session_date, created_at::date) < '2026-06-12';

delete from public.incident_reports
where lower(trim(client_name)) in ('timi', 'timmy')
  and coalesce(session_date, created_at::date) >= '2026-06-01'
  and coalesce(session_date, created_at::date) < '2026-06-15';

delete from public.cancellation_reports
where lower(trim(client_name)) = 'emmanuel'
  and coalesce(session_date, created_at::date) < '2026-06-12';

delete from public.cancellation_reports
where lower(trim(client_name)) in ('timi', 'timmy')
  and coalesce(session_date, created_at::date) >= '2026-06-01'
  and coalesce(session_date, created_at::date) < '2026-06-15';

commit;
