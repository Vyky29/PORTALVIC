-- When a venue review is submitted with issues + notes, create a row admins/CEO can read (admin dashboard alerts).

begin;

create table if not exists public.venue_review_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue_review_id uuid not null references public.venue_reviews (id) on delete cascade,
  headline text not null,
  body text null,
  read_at timestamptz null
);

create index if not exists venue_review_admin_notifications_unread_idx
  on public.venue_review_admin_notifications (created_at desc)
  where read_at is null;

alter table public.venue_review_admin_notifications enable row level security;

grant select on table public.venue_review_admin_notifications to authenticated;

drop policy if exists "venue_review_admin_notifications_select_admin_ceo"
  on public.venue_review_admin_notifications;
create policy "venue_review_admin_notifications_select_admin_ceo"
on public.venue_review_admin_notifications
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

create or replace function public.venue_reviews_notify_admin_on_issues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.has_issues = 'Yes'
     and new.issues_reported is not null
     and btrim(new.issues_reported) <> '' then
    insert into public.venue_review_admin_notifications (
      venue_review_id,
      headline,
      body
    )
    values (
      new.id,
      'Venue review: issues reported',
      'venue: ' || coalesce(new.venue, '—') || E' · ' || coalesce(new.opening_or_closing, '—') || E' · ' ||
      coalesce(new.review_date::text, '—') || E' · time ' || coalesce(new.review_time, '—') || E'\n' ||
      'reported by: ' || new.submitted_by_name || E'\n\n' ||
      new.issues_reported
    );
  end if;
  return new;
end;
$$;

drop trigger if exists venue_reviews_notify_admin_trg on public.venue_reviews;
create trigger venue_reviews_notify_admin_trg
after insert on public.venue_reviews
for each row
execute function public.venue_reviews_notify_admin_on_issues();

commit;
