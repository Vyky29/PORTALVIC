-- Admin dashboard: list session_feedback via RPC (authenticated admin/ceo only).
-- Avoids edge JWT gateway issues; uses same allowlist as RLS.

begin;

create or replace function public.portal_admin_session_feedback_list(p_since date default null)
returns table (
  id uuid,
  client_name text,
  session_date date,
  service text,
  attendance text,
  engagement_rating numeric,
  engagement_patterns text[],
  client_emotions text,
  positive_feedback text,
  relevant_information text,
  completed_by_name text,
  portal_session_key text,
  session_time text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := coalesce(p_since, (current_date - 150));
begin
  if not public.portal_staff_profile_is_admin_or_ceo() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
    select
      sf.id,
      sf.client_name,
      sf.session_date,
      sf.service,
      sf.attendance,
      sf.engagement_rating,
      sf.engagement_patterns,
      sf.client_emotions,
      sf.positive_feedback,
      sf.relevant_information,
      sf.completed_by_name,
      sf.portal_session_key,
      sf.session_time,
      sf.created_at
    from public.session_feedback sf
    where sf.session_date >= since
    order by sf.session_date desc, sf.created_at desc nulls last
    limit 2500;
end;
$$;

revoke all on function public.portal_admin_session_feedback_list(date) from public;
grant execute on function public.portal_admin_session_feedback_list(date) to authenticated;

comment on function public.portal_admin_session_feedback_list(date) is
  'Admin Sessions hub: session_feedback rows for exec/admin staff (security definer + portal_staff_profile_is_admin_or_ceo).';

commit;
