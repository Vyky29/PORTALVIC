create table if not exists public.cancellation_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  client_id text null,
  client_name text not null,
  session_date date not null,
  session_time text null,
  cancellation_timing text not null,
  service text not null,
  reason_category text not null,
  portal_session_key text null,
  origin text not null default 'dashboard',
  constraint cancellation_reports_origin_check check (origin in ('dashboard', 'this_week', 'term')),
  constraint cancellation_reports_cancellation_timing_check check (
    cancellation_timing in (
      'Before the session started',
      'During the session'
    )
  ),
  constraint cancellation_reports_reason_category_check check (
    reason_category in (
      'Illness: Fever',
      'Illness: Diarrhoea',
      'Illness: Vomiting',
      'Illness: Seizure',
      'Illness: Cold/Flu',
      'Unforeseen circumstances: Venue incident',
      'Unforeseen circumstances: Fire alarm / Fire drill',
      'Unforeseen circumstances: Power cuts / Flooding'
    )
  )
);

create index if not exists cancellation_reports_submitted_by_user_id_idx
  on public.cancellation_reports (submitted_by_user_id);

create index if not exists cancellation_reports_session_date_idx
  on public.cancellation_reports (session_date desc);

create index if not exists cancellation_reports_created_at_idx
  on public.cancellation_reports (created_at desc);

create index if not exists cancellation_reports_portal_session_key_idx
  on public.cancellation_reports (portal_session_key)
  where portal_session_key is not null;

alter table public.cancellation_reports enable row level security;

grant insert on table public.cancellation_reports to authenticated;

drop policy if exists "cancellation_reports_insert_staff_lead" on public.cancellation_reports;
create policy "cancellation_reports_insert_staff_lead"
on public.cancellation_reports
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead')
  )
);
