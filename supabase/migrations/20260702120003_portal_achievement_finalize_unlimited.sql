-- Session feedback: attach unlimited achievement photos/videos for participant+day on submit.

begin;

create or replace function public.portal_finalize_achievement_photos(
  p_feedback_id uuid default null,
  p_attached_ids uuid[] default '{}'::uuid[],
  p_client_id text default null,
  p_session_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fb record;
  v_attached int := 0;
  v_archived int := 0;
  v_cid text := lower(trim(coalesce(p_client_id, '')));
  v_ids uuid[] := coalesce(p_attached_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.portal_staff_can_use_achievement_photos() then
    raise exception 'forbidden';
  end if;

  if p_feedback_id is not null then
    select id, submitted_by_user_id, lower(trim(client_id)) as client_id, session_date
    into v_fb
    from public.session_feedback
    where id = p_feedback_id;
  elsif v_cid <> '' and p_session_date is not null then
    select id, submitted_by_user_id, lower(trim(client_id)) as client_id, session_date
    into v_fb
    from public.session_feedback
    where submitted_by_user_id = auth.uid()
      and lower(trim(coalesce(client_id, ''))) = v_cid
      and session_date = p_session_date
    order by created_at desc
    limit 1;
  end if;

  if not found then
    raise exception 'feedback_not_found';
  end if;

  if v_fb.submitted_by_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.portal_participant_achievement_photos p
  set
    status = 'attached',
    session_feedback_id = v_fb.id,
    attached_at = now()
  where p.id = any (v_ids)
    and p.status = 'draft'
    and lower(trim(p.client_id)) = v_fb.client_id
    and p.session_date = v_fb.session_date
    and p.client_id <> '_inbox';

  get diagnostics v_attached = row_count;

  update public.portal_participant_achievement_photos p
  set status = 'archived_unused'
  where p.status = 'draft'
    and lower(trim(p.client_id)) = v_fb.client_id
    and p.session_date = v_fb.session_date
    and p.client_id <> '_inbox'
    and not (p.id = any (v_ids));

  get diagnostics v_archived = row_count;

  return jsonb_build_object('attached', v_attached, 'archived_unused', v_archived);
end;
$$;

comment on function public.portal_finalize_achievement_photos(uuid, uuid[], text, date) is
  'Attach draft achievement photos/videos (any staff) to session feedback; archive remaining drafts for that participant+day.';

commit;
