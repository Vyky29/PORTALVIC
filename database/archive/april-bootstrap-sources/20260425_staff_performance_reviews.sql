-- Staff performance review records (confidential HR).
-- Apply in Supabase after public.staff_profiles and auth patterns exist.
-- Front-end: working_ui/performance.html + staff_performance_review_app.js

begin;

create table if not exists public.staff_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject_user_id uuid null references auth.users (id) on delete set null,
  subject_display_name text not null,
  review_date text not null,
  reviewer_user_id uuid not null references auth.users (id) on delete restrict,
  reviewer_display_name text not null,
  responses jsonb not null default '{}'::jsonb
);

comment on table public.staff_performance_reviews is
  'In-meeting staff performance review capture. responses holds structured form payload; subject_user_id optional link for reporting.';

create index if not exists staff_performance_reviews_created_at_idx
  on public.staff_performance_reviews (created_at desc);

create index if not exists staff_performance_reviews_subject_user_id_idx
  on public.staff_performance_reviews (subject_user_id)
  where subject_user_id is not null;

create index if not exists staff_performance_reviews_reviewer_user_id_idx
  on public.staff_performance_reviews (reviewer_user_id);

create or replace function public.staff_performance_reviews_apply_server_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  ) then
    raise exception 'Only admin, ceo or lead may record staff performance reviews';
  end if;

  if new.reviewer_user_id is null then
    new.reviewer_user_id := auth.uid();
  end if;

  if new.reviewer_user_id is distinct from auth.uid() then
    raise exception 'Reviewer must match the signed-in user';
  end if;

  select coalesce(nullif(trim(sp.full_name), ''), nullif(trim(sp.username), ''))
  into new.reviewer_display_name
  from public.staff_profiles sp
  where sp.id = new.reviewer_user_id;

  if coalesce(trim(new.reviewer_display_name), '') = '' then
    raise exception 'Missing reviewer display name on staff profile';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_performance_reviews_apply_server_fields on public.staff_performance_reviews;
create trigger trg_staff_performance_reviews_apply_server_fields
before insert on public.staff_performance_reviews
for each row
execute function public.staff_performance_reviews_apply_server_fields();

alter table public.staff_performance_reviews enable row level security;

grant insert, select on table public.staff_performance_reviews to authenticated;

drop policy if exists "staff_performance_reviews_insert_admin_ceo" on public.staff_performance_reviews;
create policy "staff_performance_reviews_insert_admin_ceo"
on public.staff_performance_reviews
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  )
  and reviewer_user_id = auth.uid()
);

drop policy if exists "staff_performance_reviews_select_admin_ceo" on public.staff_performance_reviews;
create policy "staff_performance_reviews_select_admin_ceo"
on public.staff_performance_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo', 'lead')
  )
);

commit;
