-- Extend admin session_feedback list RPC with optional Day Centre swim axes.

begin;

drop function if exists public.portal_admin_session_feedback_list(date);

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
  session_narrative text,
  completed_by_name text,
  portal_session_key text,
  session_time text,
  created_at timestamptz,
  swim_done boolean,
  swim_engagement_rating smallint,
  swim_regulation text,
  swim_independence text
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
      sf.session_narrative,
      sf.completed_by_name,
      sf.portal_session_key,
      sf.session_time,
      sf.created_at,
      coalesce(sf.swim_done, false),
      sf.swim_engagement_rating,
      sf.swim_regulation,
      sf.swim_independence
    from public.session_feedback sf
    where sf.session_date >= since
    order by sf.session_date desc, sf.created_at desc nulls last
    limit 2500;
end;
$$;

revoke all on function public.portal_admin_session_feedback_list(date) from public;
grant execute on function public.portal_admin_session_feedback_list(date) to authenticated;

comment on function public.portal_admin_session_feedback_list(date) is
  'Admin Sessions hub: session_feedback rows for exec/admin staff (includes optional Day Centre swim axes).';

commit;
