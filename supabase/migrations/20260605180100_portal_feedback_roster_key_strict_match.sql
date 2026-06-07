-- Tighten roster ↔ feedback matching: require time when roster key has time (no client/day bleed).

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
      and (
        split_part(trim(p_roster), '|', 2) !~ '^\d{1,2}:\d{2}$'
        or (
          split_part(trim(p_submitted), '|', 2) ~ '^\d{1,2}:\d{2}$'
          and split_part(trim(p_submitted), '|', 2) = split_part(trim(p_roster), '|', 2)
        )
      )
    )
  end;
$$;

comment on function public.portal_roster_key_has_feedback(text, text) is
  'Flexible date+client match with required roster time when present; prevents one feedback row clearing every slot for that client on the day.';

commit;
