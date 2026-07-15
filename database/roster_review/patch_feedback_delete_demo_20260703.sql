-- Remove demo-template session feedback for 2026-07-03 (Emanuel, Adam P, Elijah).
-- Keeps Roberto's real Fadi feedback.

delete from public.session_feedback
where session_date = '2026-07-03'
  and id in (
    '0ece9c3b-7129-409a-96fb-a038b3e1258c',
    '3942064f-b89f-47e5-8333-2ae340a6e3fd',
    '650a2892-69c5-43cd-8b03-310809d19894'
  );

-- Drop stale Fadi roster override (Roberto 12.30–3); Youssef 1–3 is correct.
delete from public.portal_roster_rows
where session_date = '2026-07-03'
  and client_name ilike 'Fadi'
  and upper(coalesce(instructors, '')) like '%ROBERTO%'
  and time_slot like '12.30%';
