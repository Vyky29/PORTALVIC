-- Fix portal_schedule_anchor_staff_matches_me: Title-Case usernames (Simon, Aurora, …)
-- were stripped of their first capital letter because regexp [^a-z0-9] ran before lower().
-- That broke staff RLS for instructor_reassign covers (covering_staff_id = 'simon' never matched).

create or replace function public.portal_schedule_anchor_staff_matches_me(p_anchor_staff_id text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
      and lower(regexp_replace(
        lower(
          split_part(
            coalesce(nullif(trim(sp.username), ''), trim(sp.full_name)),
            ' ',
            1
          )
        ),
        '[^a-z0-9]+',
        '',
        'g'
      )) = lower(trim(both from p_anchor_staff_id))
  );
$$;

comment on function public.portal_schedule_anchor_staff_matches_me(text) is
  'True when the signed-in user is staff or lead and the argument matches their derived roster key (spreadsheet staffId).';
