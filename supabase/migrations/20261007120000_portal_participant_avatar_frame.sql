-- Admin pan/zoom for parent-uploaded participant photos.
-- { x, y } are percent shift from centre (-80..80). zoom 1 shows the whole photo.

alter table public.portal_participants
  add column if not exists avatar_frame jsonb;

comment on column public.portal_participants.avatar_frame is
  'Admin crop for a parent-uploaded photo. x/y are percent shift from centre. zoom 1 shows the whole photo.';

grant update (avatar_frame, updated_at) on table public.portal_participants to authenticated;

drop policy if exists portal_participants_update_avatar_frame on public.portal_participants;
create policy portal_participants_update_avatar_frame
  on public.portal_participants
  for update
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());
