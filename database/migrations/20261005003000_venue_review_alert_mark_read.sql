-- Admin bell can mark a venue-issue alert read after it is opened.

begin;

grant update on table public.venue_review_admin_notifications to authenticated;

drop policy if exists "venue_review_admin_notifications_update_admin_ceo"
  on public.venue_review_admin_notifications;
create policy "venue_review_admin_notifications_update_admin_ceo"
on public.venue_review_admin_notifications
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.app_role in ('admin', 'ceo')
  )
);

commit;
