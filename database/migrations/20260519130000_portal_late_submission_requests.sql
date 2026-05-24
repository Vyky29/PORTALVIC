-- Late feedback / cancellation / incident: staff request admin approval to submit with original session_date.

begin;

create table if not exists public.portal_late_submission_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  portal_session_key text not null,
  session_date date not null,
  submission_type text not null,
  client_name text null,
  service_label text null,
  status text not null default 'pending',
  reviewed_by_user_id uuid null references auth.users (id) on delete set null,
  reviewed_at timestamptz null,
  admin_note text null,
  constraint portal_late_submission_type_check
    check (submission_type in ('feedback', 'cancellation', 'incident')),
  constraint portal_late_submission_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists portal_late_submission_open_uidx
  on public.portal_late_submission_requests (staff_user_id, portal_session_key, submission_type)
  where status in ('pending', 'approved');

create index if not exists portal_late_submission_status_created_idx
  on public.portal_late_submission_requests (status, created_at desc);

comment on table public.portal_late_submission_requests is
  'Staff request to submit feedback/cancellation/incident for a past session_date after admin approval.';

alter table public.portal_late_submission_requests enable row level security;

grant select, insert on public.portal_late_submission_requests to authenticated;
grant update on public.portal_late_submission_requests to authenticated;

drop policy if exists "portal_late_submission_select_own" on public.portal_late_submission_requests;
create policy "portal_late_submission_select_own"
on public.portal_late_submission_requests
for select
to authenticated
using (
  staff_user_id = auth.uid()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "portal_late_submission_insert_own" on public.portal_late_submission_requests;
create policy "portal_late_submission_insert_own"
on public.portal_late_submission_requests
for insert
to authenticated
with check (
  staff_user_id = auth.uid()
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('staff', 'lead', 'admin', 'ceo')
  )
);

drop policy if exists "portal_late_submission_update_admin" on public.portal_late_submission_requests;
create policy "portal_late_submission_update_admin"
on public.portal_late_submission_requests
for update
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid() and sp.app_role in ('admin', 'ceo')
  )
);

commit;
