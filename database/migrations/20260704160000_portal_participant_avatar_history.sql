-- Duplicate of supabase/migrations/20260704160000_portal_participant_avatar_history.sql

begin;

create table if not exists public.portal_participant_avatar_history (
  id              uuid primary key default gen_random_uuid(),
  contact_id      text not null,
  storage_path    text not null,
  source          text not null,
  is_live         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists portal_participant_avatar_history_contact_idx
  on public.portal_participant_avatar_history (contact_id, created_at desc);

comment on table public.portal_participant_avatar_history is
  'Every participant avatar upload/archive copy. Admin-only. Live path also on portal_participants.avatar_storage_path.';

alter table public.portal_participant_avatar_history enable row level security;

grant select on table public.portal_participant_avatar_history to authenticated;

drop policy if exists "portal_participant_avatar_history_admin_read" on public.portal_participant_avatar_history;
create policy "portal_participant_avatar_history_admin_read"
on public.portal_participant_avatar_history
for select
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
