-- Allow admin/CEO (e.g. Victor) to capture and attach achievement photos from the worker portal.
-- Previously only staff/lead passed portal_staff_is_staff_or_lead(); admin/CEO could SELECT but not INSERT.

begin;

create or replace function public.portal_staff_can_use_achievement_photos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo();
$$;

comment on function public.portal_staff_can_use_achievement_photos() is
  'Staff, lead, admin, or CEO — may capture/upload own achievement photos in the worker portal.';

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

-- Table: own draft rows
drop policy if exists portal_achievement_photos_select_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_select_staff_draft
  on public.portal_participant_achievement_photos
  for select
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status = 'draft'
    and public.portal_staff_can_use_achievement_photos()
  );

drop policy if exists portal_achievement_photos_insert_staff on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_insert_staff
  on public.portal_participant_achievement_photos
  for insert
  to authenticated
  with check (
    staff_user_id = auth.uid()
    and status = 'draft'
    and public.portal_staff_can_use_achievement_photos()
  );

drop policy if exists portal_achievement_photos_update_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_update_staff_draft
  on public.portal_participant_achievement_photos
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status = 'draft'
    and public.portal_staff_can_use_achievement_photos()
  )
  with check (
    staff_user_id = auth.uid()
    and status in ('attached', 'archived_unused')
    and public.portal_staff_can_use_achievement_photos()
  );

drop policy if exists portal_achievement_photos_delete_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_delete_staff_draft
  on public.portal_participant_achievement_photos
  for delete
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status = 'draft'
    and public.portal_staff_can_use_achievement_photos()
  );

-- Storage: own folder uploads + shared draft reads
drop policy if exists portal_achievement_storage_select_staff on storage.objects;
create policy portal_achievement_storage_select_staff
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.portal_staff_can_use_achievement_photos()
  );

drop policy if exists portal_achievement_storage_select_staff_shared on storage.objects;
create policy portal_achievement_storage_select_staff_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and public.portal_staff_can_use_achievement_photos()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.portal_participant_achievement_photos p
        where p.storage_path = objects.name
          and p.status = 'draft'
      )
    )
  );

drop policy if exists portal_achievement_storage_insert_staff on storage.objects;
create policy portal_achievement_storage_insert_staff
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'participant-achievements'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.portal_staff_can_use_achievement_photos()
  );

drop policy if exists portal_achievement_storage_delete_staff on storage.objects;
create policy portal_achievement_storage_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'participant-achievements'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.portal_staff_can_use_achievement_photos()
  );

-- RPC: list shared drafts for a participant slot
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
    and public.portal_staff_can_use_achievement_photos()
  order by p.created_at asc;
$$;

-- RPC: attach drafts when submitting session feedback
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
  set status = 'attached', session_feedback_id = v_fb.id, attached_at = now()
  where p.id = any (coalesce(p_attached_ids, '{}'::uuid[]))
    and p.staff_user_id = auth.uid()
    and p.status = 'draft'
    and lower(trim(p.client_id)) = v_fb.client_id
    and p.session_date = v_fb.session_date;
  get diagnostics v_attached = row_count;
  update public.portal_participant_achievement_photos p
  set status = 'archived_unused'
  where p.staff_user_id = auth.uid()
    and p.status = 'draft'
    and lower(trim(p.client_id)) = v_fb.client_id
    and p.session_date = v_fb.session_date;
  get diagnostics v_archived = row_count;
  return jsonb_build_object('attached', v_attached, 'archived_unused', v_archived);
end;
$$;

commit;
