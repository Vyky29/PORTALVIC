-- Venue opening/closing checklist submissions (portal venue_review.html).

begin;

create table if not exists public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by_user_id uuid not null references auth.users (id) on delete restrict,
  submitted_by_name text not null,
  review_date date not null,
  venue text null,
  opening_or_closing text null,
  review_time text not null,
  has_issues text not null,
  issues_reported text null,
  portal_session_key text null,
  origin text not null default 'dashboard',
  constraint venue_reviews_has_issues_check check (has_issues in ('Yes', 'No')),
  constraint venue_reviews_opening_or_closing_check check (
    opening_or_closing is null or opening_or_closing in ('Opening', 'Closing')
  ),
  constraint venue_reviews_origin_check check (origin in ('dashboard', 'this_week', 'term'))
);

create index if not exists venue_reviews_submitted_by_user_id_idx
  on public.venue_reviews (submitted_by_user_id);

create index if not exists venue_reviews_review_date_idx
  on public.venue_reviews (review_date desc);

create index if not exists venue_reviews_created_at_idx
  on public.venue_reviews (created_at desc);

create index if not exists venue_reviews_portal_session_key_idx
  on public.venue_reviews (portal_session_key)
  where portal_session_key is not null;

alter table public.venue_reviews enable row level security;

grant insert, select on table public.venue_reviews to authenticated;

drop policy if exists "venue_reviews_insert_staff_lead" on public.venue_reviews;
create policy "venue_reviews_insert_staff_lead"
on public.venue_reviews
for insert
to authenticated
with check (
  submitted_by_user_id = auth.uid()
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('staff', 'lead', 'ceo', 'admin')
  )
);

drop policy if exists "venue_reviews_select_own" on public.venue_reviews;
create policy "venue_reviews_select_own"
on public.venue_reviews
for select
to authenticated
using (submitted_by_user_id = auth.uid());

drop policy if exists "venue_reviews_select_admin_ceo" on public.venue_reviews;
create policy "venue_reviews_select_admin_ceo"
on public.venue_reviews
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
