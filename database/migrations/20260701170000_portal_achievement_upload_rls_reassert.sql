-- Re-assert achievement photo/video upload permissions after 20260701150000 regression.
-- Fixes RLS "forbidden" for Raúl (CEO), pool workers, and corporate Auth emails.
-- Idempotent: safe to run even if 20260701160000 already applied.

begin;

-- Inner helper: must bypass staff_profiles RLS when called from policies.
create or replace function public.portal_staff_is_staff_or_lead()
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
    where sp.id = (select auth.uid())
      and coalesce(sp.is_active, true)
      and lower(coalesce(sp.app_role, '')) in ('staff', 'lead')
  );
$$;

comment on function public.portal_staff_is_staff_or_lead() is
  'Active staff_profiles with app_role staff or lead.';

revoke all on function public.portal_staff_is_staff_or_lead() from public;
grant execute on function public.portal_staff_is_staff_or_lead() to authenticated;

create or replace function public.portal_auth_email_is_achievement_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) in (
        'victor@clubsensational.org',
        'raul@clubsensational.org',
        'javier@clubsensational.org',
        'javi@clubsensational.org',
        'javier@clbusensational.org',
        'sevitha@clubsensational.org',
        'info@clubsensational.org'
      )
  );
$$;

comment on function public.portal_auth_email_is_achievement_admin() is
  'Corporate Auth emails for achievement inbox + admin photo tools.';

revoke all on function public.portal_auth_email_is_achievement_admin() from public;
grant execute on function public.portal_auth_email_is_achievement_admin() to authenticated;

create or replace function public.portal_staff_profile_is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path to public
set row_security to off
as $$
  select
    public.portal_auth_email_is_achievement_admin()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and coalesce(sp.is_active, true)
        and (
          sp.app_role in ('admin', 'ceo')
          or lower(coalesce(sp.staff_role, '')) in ('manager', 'admin')
          or public.portal_profile_staff_key(sp.id) in (
            'sevitha', 'victor', 'javi', 'palankas', 'raul'
          )
        )
    );
$$;

comment on function public.portal_staff_profile_is_admin_or_ceo() is
  'Admin/CEO achievement inbox: app_role, manager staff_role, or named exec keys (incl. Raúl).';

create or replace function public.portal_staff_can_use_achievement_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_is_staff_or_lead()
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and sp.is_active is distinct from false
        and (
          lower(coalesce(nullif(trim(sp.app_role), ''), 'staff')) in ('staff', 'lead')
          or (
            lower(coalesce(sp.app_role, '')) not in ('admin', 'ceo')
            and lower(coalesce(sp.staff_role, '')) in (
              'swimming', 'climbing', 'fitness', 'support', 'support_lead', 'lead', 'manager'
            )
          )
        )
    )
    or exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and lower(u.email) in (
          'victor@clubsensational.org',
          'raul@clubsensational.org',
          'javier@clubsensational.org',
          'javi@clubsensational.org',
          'javier@clbusensational.org',
          'sevitha@clubsensational.org',
          'info@clubsensational.org'
        )
    );
$$;

comment on function public.portal_staff_can_use_achievement_photos() is
  'Staff, lead, pool workers, admin/CEO, or corporate Auth — capture/upload photos and videos.';

revoke all on function public.portal_staff_can_use_achievement_photos() from public;
grant execute on function public.portal_staff_can_use_achievement_photos() to authenticated;

-- Table policies
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

-- Storage policies
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

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'video/webm',
    'video/mp4',
    'video/quicktime'
  ]::text[]
where id = 'participant-achievements';

commit;
