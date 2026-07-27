-- Speed up portal_feedback_submitted_keys_for_sessions: filter session_feedback
-- by dates present in p_keys instead of scanning ~60 days × every roster key.

begin;

create index if not exists session_feedback_session_date_key_idx
  on public.session_feedback (session_date, portal_session_key)
  where portal_session_key is not null;

create or replace function public.portal_feedback_submitted_keys_for_sessions(p_keys text[])
returns table (portal_session_key text)
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with keys as (
    select distinct trim(k) as portal_session_key
    from unnest(coalesce(p_keys, '{}'::text[])) as k
    where coalesce(trim(k), '') <> ''
  ),
  key_dates as (
    select distinct substring(portal_session_key from 1 for 10)::date as d
    from keys
    where portal_session_key ~ '^\d{4}-\d{2}-\d{2}'
  ),
  fb as (
    select sf.portal_session_key
    from public.session_feedback sf
    where sf.portal_session_key is not null
      and sf.session_date in (select d from key_dates)
  )
  select distinct k.portal_session_key
  from keys k
  where exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
  )
  and exists (
    select 1
    from fb
    where public.portal_roster_key_has_feedback(fb.portal_session_key, k.portal_session_key)
  );
$$;

revoke all on function public.portal_feedback_submitted_keys_for_sessions(text[]) from public;
grant execute on function public.portal_feedback_submitted_keys_for_sessions(text[]) to authenticated;

comment on function public.portal_feedback_submitted_keys_for_sessions(text[]) is
  'Roster portal_session_key values from p_keys that already have session_feedback (any submitter). Date-filtered for performance.';

commit;
