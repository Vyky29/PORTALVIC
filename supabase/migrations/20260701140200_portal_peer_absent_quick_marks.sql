-- Co-instructors on shared feedback slots (bespoke / day centre) see peer absent quick marks.

begin;

create or replace function public.portal_peer_absent_quick_marks_for_sessions(p_keys text[])
returns table (portal_session_key text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select distinct m.portal_session_key
  from public.portal_staff_session_quick_marks m
  where m.mark_type = 'absent'
    and auth.uid() is not null
    and coalesce(array_length(p_keys, 1), 0) > 0
    and m.portal_session_key = any (p_keys)
    and (
      m.portal_session_key like '%|bespoke_shared'
      or m.portal_session_key like '%|day_centre'
      or m.portal_session_key like '%||%'
    );
$$;

revoke all on function public.portal_peer_absent_quick_marks_for_sessions(text[]) from public;
grant execute on function public.portal_peer_absent_quick_marks_for_sessions(text[]) to authenticated;

comment on function public.portal_peer_absent_quick_marks_for_sessions(text[]) is
  'Staff dashboard: absent quick marks from co-instructors on shared feedback unit keys.';

commit;
