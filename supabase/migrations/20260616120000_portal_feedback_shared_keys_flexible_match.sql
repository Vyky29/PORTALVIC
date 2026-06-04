-- Co-instructor feedback sync: roster keys often omit area (2026-06-03|16:15|tinashe) while
-- session_feedback may store hub/multi suffix (…|tinashe|hub_room). Match flexibly, return roster keys.

begin;

create or replace function public.portal_feedback_key_client_slugs(p_key text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(lower(tok)) filter (where tok is not null and tok <> ''),
    '{}'::text[]
  )
  from unnest(string_to_array(coalesce(p_key, ''), '|')) as tok
  where tok ~ '^[a-z0-9]'
    and tok !~ '^\d{4}-\d{2}-\d{2}$'
    and tok !~ '^\d{1,2}:\d{2}$';
$$;

create or replace function public.portal_roster_key_has_feedback(p_submitted text, p_roster text)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(trim(p_submitted), '') = '' or coalesce(trim(p_roster), '') = '' then false
    when trim(p_submitted) = trim(p_roster) then true
    else (
      split_part(trim(p_submitted), '|', 1) = split_part(trim(p_roster), '|', 1)
      and exists (
        select 1
        from unnest(public.portal_feedback_key_client_slugs(p_submitted)) s
        join unnest(public.portal_feedback_key_client_slugs(p_roster)) r on (
          s = r
          or s like '%' || r || '%'
          or r like '%' || s || '%'
        )
      )
      and (
        split_part(trim(p_roster), '|', 2) !~ '^\d{1,2}:\d{2}$'
        or split_part(trim(p_submitted), '|', 2) = split_part(trim(p_roster), '|', 2)
        or split_part(trim(p_submitted), '|', 2) !~ '^\d{1,2}:\d{2}$'
      )
    )
  end;
$$;

create or replace function public.portal_feedback_submitted_keys_for_sessions(p_keys text[])
returns table (portal_session_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct rk.portal_session_key
  from unnest(coalesce(p_keys, '{}'::text[])) as rk(portal_session_key)
  where coalesce(trim(rk.portal_session_key), '') <> ''
    and exists (
      select 1
      from public.session_feedback sf
      where sf.portal_session_key is not null
        and sf.session_date >= (current_date - interval '60 days')
        and public.portal_roster_key_has_feedback(sf.portal_session_key, rk.portal_session_key)
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
    );
$$;

revoke all on function public.portal_feedback_key_client_slugs(text) from public;
grant execute on function public.portal_feedback_key_client_slugs(text) to authenticated;

revoke all on function public.portal_roster_key_has_feedback(text, text) from public;
grant execute on function public.portal_roster_key_has_feedback(text, text) to authenticated;

revoke all on function public.portal_feedback_submitted_keys_for_sessions(text[]) from public;
grant execute on function public.portal_feedback_submitted_keys_for_sessions(text[]) to authenticated;

comment on function public.portal_feedback_submitted_keys_for_sessions(text[]) is
  'Roster portal_session_key values from p_keys that already have session_feedback (any submitter), using flexible date+client+time matching.';

commit;
