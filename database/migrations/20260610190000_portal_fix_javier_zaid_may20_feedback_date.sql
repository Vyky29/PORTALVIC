-- Javier Marquez: Zaid Multi-Activity feedback was saved with session_date 2026-06-01 (submit day)
-- but belongs to the 2026-05-20 session (late catch-up). Correct date + portal_session_key prefix.

begin;

update public.session_feedback sf
set
  session_date = '2026-05-20'::date,
  portal_session_key = case
    when coalesce(trim(sf.portal_session_key), '') = '' then '2026-05-20||zaid'
    when sf.portal_session_key like '2026-06-01%' then
      '2026-05-20' || substring(sf.portal_session_key from 11)
    else regexp_replace(sf.portal_session_key, '^[0-9]{4}-[0-9]{2}-[0-9]{2}', '2026-05-20')
  end,
  late_session_feedback = true
where sf.session_date = '2026-06-01'::date
  and lower(trim(coalesce(sf.client_name, ''))) like 'zaid%'
  and lower(trim(coalesce(sf.completed_by_name, ''))) like '%javier%'
  and sf.created_at >= timestamptz '2026-06-01 00:00:00+00'
  and sf.created_at < timestamptz '2026-06-02 00:00:00+00'
  and coalesce(sf.positive_feedback, '') ilike '%great swimming session%';

-- Javier / Zaid Sunday 17 May (9:30 Multi-Activity) — often saved with wrong session_date on late submit.
update public.session_feedback sf
set
  session_date = '2026-05-17'::date,
  portal_session_key = case
    when coalesce(trim(sf.portal_session_key), '') = '' then '2026-05-17|09:30|zaid|big_pool'
    when sf.portal_session_key ~ '^2026-[0-9]{2}-[0-9]{2}\|09:30\|zaid'
      then regexp_replace(sf.portal_session_key, '^[0-9]{4}-[0-9]{2}-[0-9]{2}', '2026-05-17')
    when sf.portal_session_key like '2026-05-17%' then sf.portal_session_key
    else '2026-05-17|09:30|zaid|big_pool'
  end,
  late_session_feedback = true
where lower(trim(coalesce(sf.client_name, ''))) like 'zaid%'
  and lower(trim(coalesce(sf.completed_by_name, ''))) like '%javier%'
  and sf.session_date is distinct from '2026-05-17'::date
  and coalesce(sf.positive_feedback, '') not ilike '%great swimming session%'
  and (
    sf.session_date >= '2026-06-01'::date
    or sf.created_at >= timestamptz '2026-05-24 00:00:00+00'
  );

commit;
