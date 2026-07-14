-- Training Records Phase 1: real training events (not portal course progress).
-- Additive: does not redefine portal_staff_training_progress / hr_records / documents.

begin;

create table if not exists public.portal_training_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null,
  title text not null,
  training_type text not null default 'other',
  status text not null default 'draft',
  venue_label text null,
  total_hours numeric(8, 2) null,
  notes text null,
  document_id uuid null,
  constraint portal_training_records_type_check check (
    training_type in (
      'emergency_evacuation',
      'venue_induction',
      'internal_training',
      'external_training',
      'swimming_shadowing',
      'behaviour_communication',
      'practical_assessment',
      'policy_briefing',
      'other'
    )
  ),
  constraint portal_training_records_status_check check (
    status in ('draft', 'open', 'completed', 'cancelled')
  ),
  constraint portal_training_records_hours_chk check (
    total_hours is null or total_hours >= 0
  )
);

comment on table public.portal_training_records is
  'Real staff training events (attendance/signature). Separate from portal course progress and HR matrix.';

create index if not exists portal_training_records_status_idx
  on public.portal_training_records (status, created_at desc);

create index if not exists portal_training_records_type_idx
  on public.portal_training_records (training_type, created_at desc);

create table if not exists public.portal_training_record_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  record_id uuid not null
    references public.portal_training_records (id) on delete cascade,
  session_date date not null,
  start_time time null,
  end_time time null,
  hours numeric(8, 2) null,
  location_label text null,
  sort_index int not null default 0,
  constraint portal_training_record_sessions_hours_chk check (
    hours is null or hours >= 0
  )
);

create index if not exists portal_training_record_sessions_record_idx
  on public.portal_training_record_sessions (record_id, sort_index, session_date);

create table if not exists public.portal_training_record_participants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  record_id uuid not null
    references public.portal_training_records (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  attendance_status text not null default 'pending',
  hours numeric(8, 2) null,
  outcome text not null default 'pending',
  notes text null,
  signature_png text null,
  typed_name text null,
  signed_at timestamptz null,
  document_id uuid null,
  announcement_id uuid null,
  constraint portal_training_record_participants_attendance_check check (
    attendance_status in ('pending', 'present', 'absent', 'excused')
  ),
  constraint portal_training_record_participants_outcome_check check (
    outcome in ('pending', 'completed', 'incomplete', 'not_applicable')
  ),
  constraint portal_training_record_participants_hours_chk check (
    hours is null or hours >= 0
  ),
  constraint portal_training_record_participants_record_user_uidx unique (record_id, user_id)
);

create index if not exists portal_training_record_participants_user_idx
  on public.portal_training_record_participants (user_id, attendance_status);

create index if not exists portal_training_record_participants_record_idx
  on public.portal_training_record_participants (record_id);

create or replace function public.portal_training_records_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists portal_training_records_touch on public.portal_training_records;
create trigger portal_training_records_touch
  before update on public.portal_training_records
  for each row execute function public.portal_training_records_touch_updated_at();

drop trigger if exists portal_training_record_participants_touch
  on public.portal_training_record_participants;
create trigger portal_training_record_participants_touch
  before update on public.portal_training_record_participants
  for each row execute function public.portal_training_records_touch_updated_at();

alter table public.portal_training_records enable row level security;
alter table public.portal_training_record_sessions enable row level security;
alter table public.portal_training_record_participants enable row level security;

grant select, insert, update, delete on table public.portal_training_records to authenticated;
grant select, insert, update, delete on table public.portal_training_record_sessions to authenticated;
grant select, insert, update, delete on table public.portal_training_record_participants to authenticated;

-- Admin / CEO manage all
drop policy if exists portal_training_records_admin_all on public.portal_training_records;
create policy portal_training_records_admin_all
  on public.portal_training_records
  for all
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_training_sessions_admin_all on public.portal_training_record_sessions;
create policy portal_training_sessions_admin_all
  on public.portal_training_record_sessions
  for all
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_training_participants_admin_all
  on public.portal_training_record_participants;
create policy portal_training_participants_admin_all
  on public.portal_training_record_participants
  for all
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

-- Staff: read parent record when assigned
drop policy if exists portal_training_records_select_assignee on public.portal_training_records;
create policy portal_training_records_select_assignee
  on public.portal_training_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_training_record_participants p
      where p.record_id = portal_training_records.id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists portal_training_sessions_select_assignee
  on public.portal_training_record_sessions;
create policy portal_training_sessions_select_assignee
  on public.portal_training_record_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_training_record_participants p
      where p.record_id = portal_training_record_sessions.record_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists portal_training_participants_select_own
  on public.portal_training_record_participants;
create policy portal_training_participants_select_own
  on public.portal_training_record_participants
  for select
  to authenticated
  using (user_id = auth.uid());

-- Staff: sign own attendance (limited columns via application; RLS allows update of own row)
drop policy if exists portal_training_participants_update_own_sign
  on public.portal_training_record_participants;
create policy portal_training_participants_update_own_sign
  on public.portal_training_record_participants
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
