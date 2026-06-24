-- Parent-editable participant general information (syncs to staff dashboard + admin via hydrate).

begin;

create table if not exists public.portal_participant_general_info (
  contact_id                  text primary key references public.portal_participants (contact_id) on delete cascade,
  general_info_sheet          text not null default '',
  updated_at                  timestamptz not null default now(),
  updated_by_parent_person_id text null
);

create index if not exists portal_participant_general_info_updated_idx
  on public.portal_participant_general_info (updated_at desc);

comment on table public.portal_participant_general_info is
  'Parent-maintained general info sheet (same numbered format as Clients Info embed).';

create table if not exists public.portal_participant_general_info_log (
  id                uuid primary key default gen_random_uuid(),
  contact_id        text not null,
  parent_person_id  text null,
  general_info_sheet text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists portal_participant_general_info_log_contact_idx
  on public.portal_participant_general_info_log (contact_id, created_at desc);

alter table public.portal_participant_general_info enable row level security;
alter table public.portal_participant_general_info_log enable row level security;

revoke all on public.portal_participant_general_info from public, anon, authenticated;
revoke all on public.portal_participant_general_info_log from public, anon, authenticated;

grant select on public.portal_participant_general_info to authenticated;
grant select, insert, update on public.portal_participant_general_info to service_role;
grant select, insert on public.portal_participant_general_info_log to service_role;

drop policy if exists portal_participant_general_info_select_staff on public.portal_participant_general_info;
create policy portal_participant_general_info_select_staff
  on public.portal_participant_general_info
  for select
  to authenticated
  using (
    public.portal_staff_is_staff_or_lead()
    or public.portal_staff_profile_is_admin_or_ceo()
  );

commit;
