-- Participant profile photos: public read (parent portal + instructor recognition), staff SELECT on registry.

begin;

update storage.buckets
set public = true
where id = 'participant-avatars';

-- Staff/admin can read participant registry (avatar paths only; no PII beyond names already on roster).
drop policy if exists portal_participants_select_staff on public.portal_participants;
create policy portal_participants_select_staff
  on public.portal_participants
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

grant select on public.portal_participants to authenticated;

-- Public read on avatar objects (bucket is public; policy documents intent).
drop policy if exists participant_avatars_public_read on storage.objects;
create policy participant_avatars_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'participant-avatars');

-- Service role / admin can upload participant avatars.
drop policy if exists participant_avatars_service_write on storage.objects;
create policy participant_avatars_service_write
  on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'participant-avatars');

drop policy if exists participant_avatars_service_update on storage.objects;
create policy participant_avatars_service_update
  on storage.objects
  for update
  to service_role
  using (bucket_id = 'participant-avatars');

commit;
