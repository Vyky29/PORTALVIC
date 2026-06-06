-- Co-instructor sync: roster keys may use 16:15 (spreadsheet) while feedback uses 16:30 (overview).
-- Match on calendar date + client slug; do not require identical HH:mm in part 2.

begin;

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
    )
  end;
$$;

comment on function public.portal_roster_key_has_feedback(text, text) is
  'Flexible portal_session_key match: same day + client slug, or feedback day after roster (late submit).';

commit;
