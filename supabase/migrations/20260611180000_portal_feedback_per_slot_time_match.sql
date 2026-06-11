-- Per-slot aquatic (same client, different instructors/times same day): do not match
-- date||client roster aliases to timed submissions from another slot.

begin;

create or replace function public.portal_feedback_key_time_token(p_key text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select tok
      from unnest(string_to_array(coalesce(p_key, ''), '|')) as tok
      where tok ~ '^\d{1,2}:\d{2}$'
      limit 1
    ),
    ''
  );
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
        public.portal_feedback_key_time_token(p_roster) = ''
        or public.portal_feedback_key_time_token(p_submitted) = ''
        or public.portal_feedback_key_time_token(p_submitted) = public.portal_feedback_key_time_token(p_roster)
      )
      and not (
        split_part(trim(p_roster), '|', 2) = ''
        and coalesce(split_part(trim(p_roster), '|', 3), '') <> ''
        and coalesce(split_part(trim(p_roster), '|', 4), '') = ''
        and public.portal_feedback_key_time_token(p_submitted) <> ''
      )
    )
  end;
$$;

revoke all on function public.portal_feedback_key_time_token(text) from public;
grant execute on function public.portal_feedback_key_time_token(text) to authenticated;

comment on function public.portal_roster_key_has_feedback(text, text) is
  'Flexible session_feedback ↔ roster key match; blocks date||client from absorbing another slot''s timed submission.';

commit;
