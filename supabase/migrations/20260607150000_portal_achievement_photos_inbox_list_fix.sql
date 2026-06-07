-- Fix lead inbox draft listing: RPC previously excluded all _inbox rows, so saved photos never appeared.

begin;

create or replace function public.portal_list_participant_achievement_drafts(
  p_client_id text,
  p_session_date date,
  p_portal_session_key text default null
)
returns table (
  id uuid,
  storage_path text,
  created_at timestamptz,
  width int,
  height int,
  staff_user_id uuid,
  staff_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.storage_path,
    p.created_at,
    p.width,
    p.height,
    p.staff_user_id,
    p.staff_display_name
  from public.portal_participant_achievement_photos p
  where p.status = 'draft'
    and p.session_date = p_session_date
    and p.client_id = public.portal_normalize_achievement_client_id(p_client_id)
    and (
      p.client_id <> '_inbox'
      or p.staff_user_id = auth.uid()
    )
    and public.portal_staff_can_use_achievement_photos()
  order by p.created_at asc;
$$;

comment on function public.portal_list_participant_achievement_drafts(text, date, text) is
  'Draft achievement photos for client+day; inbox (_inbox) scoped to the uploading staff member.';

commit;
