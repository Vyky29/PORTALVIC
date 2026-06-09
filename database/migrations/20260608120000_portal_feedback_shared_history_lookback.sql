-- Extend co-instructor feedback RPC lookback for full Summer Term history.
-- Shared Day Centre / Bespoke keys (bespoke_shared, day_centre) match on date + client.

begin;

create or replace function public.portal_roster_key_has_feedback(p_submitted text, p_roster text)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(trim(p_submitted), '') = '' or coalesce(trim(p_roster), '') = '' then false
    when trim(p_submitted) = trim(p_roster) then true
    when (
      lower(trim(p_roster)) like '%|day_centre%'
      or lower(trim(p_roster)) like '%|bespoke_shared%'
      or lower(trim(p_submitted)) like '%|day_centre%'
      or lower(trim(p_submitted)) like '%|bespoke_shared%'
    ) then (
      split_part(trim(p_submitted), '|', 1) = split_part(trim(p_roster), '|', 1)
      and exists (
        select 1
        from unnest(public.portal_feedback_key_client_slugs(p_submitted)) s
        join unnest(public.portal_feedback_key_client_slugs(p_roster)) r on (
          s = r
          or s like '%' || r || '%'
          or r like '%' || s || '%'
        )
        where s not in ('day_centre', 'bespoke_shared', 'hub', 'hub_room')
          and r not in ('day_centre', 'bespoke_shared', 'hub', 'hub_room')
      )
    )
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
        and sf.session_date >= (current_date - interval '150 days')
        and public.portal_roster_key_has_feedback(sf.portal_session_key, rk.portal_session_key)
    )
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
    );
$$;

comment on function public.portal_feedback_submitted_keys_for_sessions(text[]) is
  'Roster portal_session_key values from p_keys with session_feedback from any submitter (flexible matching, 150-day lookback).';

commit;
