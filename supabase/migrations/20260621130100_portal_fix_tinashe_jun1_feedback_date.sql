-- Tinashe Mon 2026-06-01: feedback sometimes saved on submit day (2026-06-02) instead of session day.

begin;

update public.session_feedback sf
set
  session_date = '2026-06-01'::date,
  portal_session_key = case
    when coalesce(trim(sf.portal_session_key), '') = '' then '2026-06-01|16:30|tinashe|hub_room'
    when sf.portal_session_key like '2026-06-02%' then
      '2026-06-01' || substring(sf.portal_session_key from 11)
    else regexp_replace(sf.portal_session_key, '^[0-9]{4}-[0-9]{2}-[0-9]{2}', '2026-06-01')
  end,
  late_session_feedback = true
where lower(trim(coalesce(sf.client_name, ''))) like 'tinashe%'
  and sf.session_date = '2026-06-02'::date
  and sf.created_at >= timestamptz '2026-06-01 00:00:00+00'
  and sf.created_at < timestamptz '2026-06-06 00:00:00+00'
  and coalesce(sf.attendance, '') not ilike 'no%';

commit;
