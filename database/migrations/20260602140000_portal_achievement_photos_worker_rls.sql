-- Achievement photos: allow pool workers (swimming/climbing/etc.) and blank app_role, not only app_role staff/lead.
-- Fixes: "new row violates row-level security policy" when instructors capture session photos.

begin;

create or replace function public.portal_staff_can_use_achievement_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.is_active is distinct from false
      and (
        public.portal_staff_profile_is_admin_or_ceo()
        or lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
        or (
          lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
          and lower(coalesce(sp.staff_role, '')) in (
            'swimming', 'climbing', 'fitness', 'support', 'support_lead', 'lead'
          )
        )
      )
  );
$$;

comment on function public.portal_staff_can_use_achievement_photos() is
  'Staff, lead, pool workers (staff_role), admin, or CEO — capture/list achievement photos in the worker portal.';

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

-- Table policies (idempotent)
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

-- Storage
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

-- Shared draft list RPC
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

commit;
