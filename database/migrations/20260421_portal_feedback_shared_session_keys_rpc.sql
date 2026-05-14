-- Co-instructors (same client, date, time slot): any staff submission counts for all.
-- Dashboard passes roster portal_session_key values; RPC returns keys that already have
-- a session_feedback row from any submitter (RLS still hides row bodies from other users).

begin;

create or replace function public.portal_feedback_submitted_keys_for_sessions(p_keys text[])
returns table (portal_session_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct sf.portal_session_key
  from public.session_feedback sf
  where sf.portal_session_key is not null
    and p_keys is not null
    and coalesce(array_length(p_keys, 1), 0) > 0
    and sf.portal_session_key = any (p_keys)
    and sf.session_date >= (current_date - interval '60 days')
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
    );
$$;

revoke all on function public.portal_feedback_submitted_keys_for_sessions (text[]) from public;
grant execute on function public.portal_feedback_submitted_keys_for_sessions (text[]) to authenticated;

comment on function public.portal_feedback_submitted_keys_for_sessions (text[]) is
  'Distinct portal_session_key values that have feedback (any submitter), filtered to p_keys. For shared-slot dashboard sync.';

commit;
