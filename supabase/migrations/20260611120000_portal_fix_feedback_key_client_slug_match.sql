-- Fix false-positive feedback matches: Vithura aquatic must not mark Amber aquatic done.
-- Old portal_roster_key_has_feedback matched any shared token (e.g. "aquatic") via LIKE substring.

begin;

create or replace function public.portal_feedback_non_participant_slug(p_tok text)
returns boolean
language sql
immutable
as $$
  select coalesce(trim(lower(p_tok)), '') in (
    'aquatic', 'day_centre', 'bespoke_shared', 'hub_room', 'teaching_pool',
    'big_pool', 'climbing', 'climbing_wall', 'multi_activity', 'multi-activity'
  )
  or coalesce(trim(lower(p_tok)), '') ~ '^(multi|climb|swim|bespoke|day_centre)';
$$;

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
    and tok !~ '^\d{1,2}:\d{2}$'
    and not public.portal_feedback_non_participant_slug(tok);
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
          or (s = 'amar_rai' and r = 'amar_ra')
          or (s = 'amar_ra' and r = 'amar_rai')
          or (s like r || '\_%' escape '\')
          or (r like s || '\_%' escape '\')
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

revoke all on function public.portal_feedback_non_participant_slug(text) from public;
grant execute on function public.portal_feedback_non_participant_slug(text) to authenticated;

comment on function public.portal_roster_key_has_feedback(text, text) is
  'True when session_feedback portal_session_key matches a roster key by date + participant slug (not area tokens like aquatic).';

commit;
