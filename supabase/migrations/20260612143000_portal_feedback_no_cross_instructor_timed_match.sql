-- Stop merge / date-only feedback keys from marking unrelated timed MA/climbing slots green (Yusuf Ah Sunday).

begin;

create or replace function public.portal_roster_key_has_feedback(p_submitted text, p_roster text)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(trim(p_submitted), '') = '' or coalesce(trim(p_roster), '') = '' then false
    when trim(p_submitted) = trim(p_roster) then true
    when trim(p_submitted) ~ '^\d{4}-\d{2}-\d{2}\|merge\|' then false
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
      and not (
        split_part(trim(p_roster), '|', 2) ~ '^\d{1,2}:\d{2}$'
        and coalesce(nullif(split_part(trim(p_submitted), '|', 2), ''), '') !~ '^\d{1,2}:\d{2}$'
        and lower(
          split_part(
            trim(p_roster),
            '|',
            array_length(string_to_array(trim(p_roster), '|'), 1)
          )
        ) not in ('day_centre', 'bespoke_shared')
      )
    )
  end;
$$;

comment on function public.portal_roster_key_has_feedback(text, text) is
  'Flexible date+client+time match; merge keys and date-only submissions do not cover unrelated timed per-instructor slots.';

commit;
