-- Session feedback: single persistence layer (Supabase). Run in Supabase SQL editor or via migration tooling.
-- Depends on: public.staff_profiles (id = auth.uid(), app_role in admin|ceo|lead|staff).

begin;

create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  feedback_role text not null,
  portal_session_key text null,
  client_name text not null,
  session_date date not null,
  service text not null,
  attendance text not null,
  engagement_rating smallint not null,
  engagement_patterns text[] not null default '{}'::text[],
  positive_feedback text null,
  client_emotions text not null,
  exceptional_challenges text null,
  incidents text not null,
  completed_by_name text not null,
  has_positive_feedback boolean not null default false,
  has_exceptional_challenges boolean not null default false,
  constraint session_feedback_feedback_role_check
    check (feedback_role in ('staff', 'lead')),
  constraint session_feedback_engagement_rating_check
    check (engagement_rating between 1 and 5)
);

create index if not exists session_feedback_submitted_by_user_id_idx
  on public.session_feedback (submitted_by_user_id);

create index if not exists session_feedback_session_date_idx
  on public.session_feedback (session_date desc);

create index if not exists session_feedback_created_at_idx
  on public.session_feedback (created_at desc);

create index if not exists session_feedback_portal_session_key_idx
  on public.session_feedback (portal_session_key)
  where portal_session_key is not null;

alter table public.session_feedback enable row level security;

grant insert, select on table public.session_feedback to authenticated;

drop policy if exists "session_feedback_insert_staff_lead" on public.session_feedback;
create policy "session_feedback_insert_staff_lead"
on public.session_feedback
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and feedback_role in ('staff', 'lead')
  and (
    (
      feedback_role = 'lead'
      and exists (
        select 1
        from public.staff_profiles sp
        where sp.id = auth.uid()
          and sp.app_role = 'lead'
      )
    )
    or (
      feedback_role = 'staff'
      and exists (
        select 1
        from public.staff_profiles sp
        where sp.id = auth.uid()
          and sp.app_role in ('staff', 'lead')
      )
    )
  )
);

drop policy if exists "session_feedback_select_admin_ceo" on public.session_feedback;
create policy "session_feedback_select_admin_ceo"
on public.session_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
