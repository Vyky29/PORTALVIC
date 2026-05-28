-- Participant achievement photos (in-app session captures; attach to session feedback).

begin;

create or replace function public.portal_staff_is_staff_or_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and lower(coalesce(sp.app_role, '')) in ('staff', 'lead')
  );
$$;

revoke all on function public.portal_staff_is_staff_or_lead() from public;
grant execute on function public.portal_staff_is_staff_or_lead() to authenticated;

create table if not exists public.portal_participant_achievement_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  staff_display_name text not null default '',
  client_id text not null,
  client_name text not null default '',
  session_date date not null,
  portal_session_key text null,
  storage_path text not null,
  status text not null default 'draft',
  session_feedback_id uuid null references public.session_feedback (id) on delete set null,
  attached_at timestamptz null,
  width int null,
  height int null,
  byte_size bigint null,
  constraint portal_achievement_photos_status_check
    check (status in ('draft', 'attached', 'archived_unused'))
);

create index if not exists portal_achievement_photos_staff_day_client_idx
  on public.portal_participant_achievement_photos (staff_user_id, session_date, client_id);

alter table public.portal_participant_achievement_photos enable row level security;

grant select, insert, update on table public.portal_participant_achievement_photos to authenticated;

drop policy if exists portal_achievement_photos_select_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_select_staff_draft
  on public.portal_participant_achievement_photos for select to authenticated
  using (staff_user_id = auth.uid() and status = 'draft' and public.portal_staff_is_staff_or_lead());

drop policy if exists portal_achievement_photos_select_admin on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_select_admin
  on public.portal_participant_achievement_photos for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_achievement_photos_insert_staff on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_insert_staff
  on public.portal_participant_achievement_photos for insert to authenticated
  with check (staff_user_id = auth.uid() and status = 'draft' and public.portal_staff_is_staff_or_lead());

drop policy if exists portal_achievement_photos_update_staff_draft on public.portal_participant_achievement_photos;
create policy portal_achievement_photos_update_staff_draft
  on public.portal_participant_achievement_photos for update to authenticated
  using (staff_user_id = auth.uid() and status = 'draft' and public.portal_staff_is_staff_or_lead())
  with check (staff_user_id = auth.uid() and status in ('attached', 'archived_unused') and public.portal_staff_is_staff_or_lead());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('participant-achievements', 'participant-achievements', false, 15728640, array['image/jpeg', 'image/jpg', 'image/webp']::text[])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_achievement_storage_select_staff on storage.objects;
create policy portal_achievement_storage_select_staff on storage.objects for select to authenticated
  using (bucket_id = 'participant-achievements' and (storage.foldername(name))[1] = auth.uid()::text and public.portal_staff_is_staff_or_lead());

drop policy if exists portal_achievement_storage_select_admin on storage.objects;
create policy portal_achievement_storage_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'participant-achievements' and public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_achievement_storage_insert_staff on storage.objects;
create policy portal_achievement_storage_insert_staff on storage.objects for insert to authenticated
  with check (bucket_id = 'participant-achievements' and (storage.foldername(name))[1] = auth.uid()::text and public.portal_staff_is_staff_or_lead());

create or replace function public.portal_finalize_achievement_photos(
  p_feedback_id uuid default null,
  p_attached_ids uuid[] default '{}'::uuid[],
  p_client_id text default null,
  p_session_date date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fb record; v_attached int := 0; v_archived int := 0;
  v_cid text := lower(trim(coalesce(p_client_id, '')));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.portal_staff_is_staff_or_lead() then raise exception 'forbidden'; end if;
  if p_feedback_id is not null then
    select id, submitted_by_user_id, lower(trim(client_id)) as client_id, session_date into v_fb from public.session_feedback where id = p_feedback_id;
  elsif v_cid <> '' and p_session_date is not null then
    select id, submitted_by_user_id, lower(trim(client_id)) as client_id, session_date into v_fb from public.session_feedback
    where submitted_by_user_id = auth.uid() and lower(trim(coalesce(client_id, ''))) = v_cid and session_date = p_session_date
    order by created_at desc limit 1;
  end if;
  if not found then raise exception 'feedback_not_found'; end if;
  if v_fb.submitted_by_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  update public.portal_participant_achievement_photos p set status = 'attached', session_feedback_id = v_fb.id, attached_at = now()
  where p.id = any (coalesce(p_attached_ids, '{}'::uuid[])) and p.staff_user_id = auth.uid() and p.status = 'draft'
    and lower(trim(p.client_id)) = v_fb.client_id and p.session_date = v_fb.session_date;
  get diagnostics v_attached = row_count;
  update public.portal_participant_achievement_photos p set status = 'archived_unused'
  where p.staff_user_id = auth.uid() and p.status = 'draft' and lower(trim(p.client_id)) = v_fb.client_id and p.session_date = v_fb.session_date;
  get diagnostics v_archived = row_count;
  return jsonb_build_object('attached', v_attached, 'archived_unused', v_archived);
end; $$;

grant execute on function public.portal_finalize_achievement_photos(uuid, uuid[], text, date) to authenticated;
commit;
