-- Venue-issue bell is per admin, like chat reads.
-- Close on one admin does not clear it for the others.

begin;

create table if not exists public.venue_review_admin_notification_reads (
  notification_id uuid not null references public.venue_review_admin_notifications (id) on delete cascade,
  user_id uuid not null references public.staff_profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists venue_review_admin_notification_reads_user_idx
  on public.venue_review_admin_notification_reads (user_id);

alter table public.venue_review_admin_notification_reads enable row level security;

grant select, insert on table public.venue_review_admin_notification_reads to authenticated;

drop policy if exists "venue_review_alert_reads_select_own"
  on public.venue_review_admin_notification_reads;
create policy "venue_review_alert_reads_select_own"
on public.venue_review_admin_notification_reads
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

drop policy if exists "venue_review_alert_reads_insert_own"
  on public.venue_review_admin_notification_reads;
create policy "venue_review_alert_reads_insert_own"
on public.venue_review_admin_notification_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
