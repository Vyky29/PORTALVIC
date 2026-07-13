-- Apply in Portal Supabase SQL Editor (project cklpnwhlqsulpmkipmqb).
-- Late session feedback: hold timesheet pay until admin clears the staff+session day.

begin;

create table if not exists public.portal_late_feedback_pay_clearances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  cleared_by_user_id uuid null references auth.users (id) on delete set null,
  note text null,
  constraint portal_late_feedback_pay_clearances_uidx unique (staff_user_id, session_date)
);

comment on table public.portal_late_feedback_pay_clearances is
  'Admin release of late-submitted session feedback for a staff calendar day so timesheet hours become payable. No penalty applied here yet.';

create index if not exists portal_late_feedback_pay_clearances_staff_date_idx
  on public.portal_late_feedback_pay_clearances (staff_user_id, session_date desc);

create index if not exists portal_late_feedback_pay_clearances_date_idx
  on public.portal_late_feedback_pay_clearances (session_date desc);

alter table public.portal_late_feedback_pay_clearances enable row level security;

grant select on table public.portal_late_feedback_pay_clearances to authenticated;
grant insert, update, delete on table public.portal_late_feedback_pay_clearances to authenticated;

drop policy if exists "plfpc_select_own_admin" on public.portal_late_feedback_pay_clearances;
create policy "plfpc_select_own_admin"
on public.portal_late_feedback_pay_clearances
for select
to authenticated
using (
  staff_user_id = auth.uid()
  or public.portal_staff_profile_is_portal_admin()
);

drop policy if exists "plfpc_insert_admin" on public.portal_late_feedback_pay_clearances;
create policy "plfpc_insert_admin"
on public.portal_late_feedback_pay_clearances
for insert
to authenticated
with check (public.portal_staff_profile_is_portal_admin());

drop policy if exists "plfpc_update_admin" on public.portal_late_feedback_pay_clearances;
create policy "plfpc_update_admin"
on public.portal_late_feedback_pay_clearances
for update
to authenticated
using (public.portal_staff_profile_is_portal_admin())
with check (public.portal_staff_profile_is_portal_admin());

drop policy if exists "plfpc_delete_admin" on public.portal_late_feedback_pay_clearances;
create policy "plfpc_delete_admin"
on public.portal_late_feedback_pay_clearances
for delete
to authenticated
using (public.portal_staff_profile_is_portal_admin());

commit;
