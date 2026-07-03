-- Mirror: supabase/migrations/20260703194500_portal_staff_ld_funding_applications.sql

begin;

create table if not exists public.portal_staff_ld_funding_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending',
  employee_name text not null,
  job_title text,
  service_department text,
  application_date date not null default current_date,
  course_title text not null,
  training_provider text not null,
  course_start_date date,
  course_end_date date,
  delivery_method text,
  total_course_cost_gbp numeric(10, 2),
  why_learning text,
  role_improvement text,
  participants_benefit text,
  apply_share_plan text,
  applying_for_scheme boolean not null default true,
  can_pay_upfront boolean,
  requests_exceptional_funding boolean not null default false,
  exceptional_funding_note text,
  declaration_accepted boolean not null default false,
  origin text not null default 'dashboard',
  constraint portal_staff_ld_funding_applications_status_check check (
    status in ('pending', 'approved', 'declined', 'approved_conditional')
  ),
  constraint portal_staff_ld_funding_applications_delivery_method_check check (
    delivery_method is null
    or delivery_method in ('online', 'face_to_face', 'blended')
  ),
  constraint portal_staff_ld_funding_applications_origin_check check (
    origin in ('dashboard', 'quick_menu', 'policy', 'direct')
  ),
  constraint portal_staff_ld_funding_applications_cost_chk check (
    total_course_cost_gbp is null or total_course_cost_gbp >= 0
  )
);

comment on table public.portal_staff_ld_funding_applications is
  'Staff L&D funding applications (POL-049). Directors review in Phase 2 admin queue.';

create index if not exists portal_staff_ld_funding_applications_user_idx
  on public.portal_staff_ld_funding_applications (submitted_by_user_id);

create index if not exists portal_staff_ld_funding_applications_status_idx
  on public.portal_staff_ld_funding_applications (status, created_at desc);

create or replace function public.portal_staff_ld_funding_applications_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portal_staff_ld_funding_applications_touch
  on public.portal_staff_ld_funding_applications;
create trigger portal_staff_ld_funding_applications_touch
  before update on public.portal_staff_ld_funding_applications
  for each row execute function public.portal_staff_ld_funding_applications_touch_updated_at();

alter table public.portal_staff_ld_funding_applications enable row level security;

grant insert, select on table public.portal_staff_ld_funding_applications to authenticated;

drop policy if exists "portal_ld_funding_insert_staff_lead"
  on public.portal_staff_ld_funding_applications;
create policy "portal_ld_funding_insert_staff_lead"
  on public.portal_staff_ld_funding_applications
  for insert
  to authenticated
  with check (
    submitted_by_user_id = auth.uid()
    and declaration_accepted = true
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.app_role in ('staff', 'lead')
    )
  );

drop policy if exists "portal_ld_funding_select_own"
  on public.portal_staff_ld_funding_applications;
create policy "portal_ld_funding_select_own"
  on public.portal_staff_ld_funding_applications
  for select
  to authenticated
  using (submitted_by_user_id = auth.uid());

drop policy if exists "portal_ld_funding_admin_select"
  on public.portal_staff_ld_funding_applications;
create policy "portal_ld_funding_admin_select"
  on public.portal_staff_ld_funding_applications
  for select
  to authenticated
  using (
    public.portal_staff_profile_is_admin_or_ceo()
    or public.portal_staff_profile_is_exec_operator()
  );

commit;
