-- Queue: admin overrides → fold back into roster_term_master.json (MADRE).

begin;

create table if not exists public.portal_madre_fold_queue (
  id uuid primary key default gen_random_uuid(),
  fold_type text not null check (fold_type in (
    'participant_slot_upsert',
    'participant_slot_cancel',
    'staff_shift_upsert',
    'staff_shift_cancel'
  )),
  session_date date,
  payload jsonb not null default '{}'::jsonb,
  before_snapshot jsonb,
  source_module text,
  source_row_id uuid,
  status text not null default 'pending' check (status in ('pending', 'applied', 'skipped', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  applied_at timestamptz,
  applied_by uuid references auth.users (id)
);

create index if not exists portal_madre_fold_queue_pending_idx
  on public.portal_madre_fold_queue (status, created_at)
  where status = 'pending';

alter table public.portal_madre_fold_queue enable row level security;

drop policy if exists portal_madre_fold_queue_admin_insert on public.portal_madre_fold_queue;
create policy portal_madre_fold_queue_admin_insert
  on public.portal_madre_fold_queue for insert to authenticated
  with check (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_madre_fold_queue_admin_select on public.portal_madre_fold_queue;
create policy portal_madre_fold_queue_admin_select
  on public.portal_madre_fold_queue for select to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

drop policy if exists portal_madre_fold_queue_admin_update on public.portal_madre_fold_queue;
create policy portal_madre_fold_queue_admin_update
  on public.portal_madre_fold_queue for update to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo())
  with check (public.portal_staff_profile_is_admin_or_ceo());

commit;
