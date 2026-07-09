-- Replace all staff announcements with the production "Portal is ready" notice.
-- Track signatures in portal_staff_announcement_acks (admin can see who signed).

begin;

create table if not exists public.portal_staff_announcement_acks (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.portal_staff_announcements (id) on delete cascade,
  staff_id uuid not null references auth.users (id) on delete cascade,
  signed_at timestamptz not null default now(),
  staff_full_name text null,
  staff_username text null,
  constraint portal_staff_announcement_acks_unique unique (announcement_id, staff_id)
);

comment on table public.portal_staff_announcement_acks is
  'Staff/lead signature on a portal_staff_announcements row; one row per user per announcement.';

create index if not exists portal_staff_announcement_acks_ann_idx
  on public.portal_staff_announcement_acks (announcement_id, signed_at desc);

create index if not exists portal_staff_announcement_acks_staff_idx
  on public.portal_staff_announcement_acks (staff_id, signed_at desc);

alter table public.portal_staff_announcement_acks enable row level security;

revoke all on public.portal_staff_announcement_acks from public;
revoke all on public.portal_staff_announcement_acks from anon;
grant select, insert on public.portal_staff_announcement_acks to authenticated;

drop policy if exists "portal_staff_announcement_acks_insert_own" on public.portal_staff_announcement_acks;
create policy "portal_staff_announcement_acks_insert_own"
  on public.portal_staff_announcement_acks
  for insert
  to authenticated
  with check (
    staff_id = auth.uid()
    and exists (
      select 1
      from public.portal_staff_announcements a
      where a.id = announcement_id
        and (a.ends_at is null or a.ends_at >= now())
        and (
          (
            a.audience_scope = 'all_staff'
            and a.delivery_scope = 'everyone'
            and exists (
              select 1 from public.staff_profiles sp
              where sp.id = auth.uid() and sp.is_active is distinct from false
            )
          )
          or (
            a.audience_scope = 'leads'
            and exists (
              select 1 from public.staff_profiles sp
              where sp.id = auth.uid() and sp.app_role = 'lead'
            )
          )
          or (
            a.audience_scope = 'all_staff'
            and a.delivery_scope = 'single_user'
            and a.target_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "portal_staff_announcement_acks_select_own" on public.portal_staff_announcement_acks;
create policy "portal_staff_announcement_acks_select_own"
  on public.portal_staff_announcement_acks
  for select
  to authenticated
  using (staff_id = auth.uid());

drop policy if exists "portal_staff_announcement_acks_select_admin_ceo" on public.portal_staff_announcement_acks;
create policy "portal_staff_announcement_acks_select_admin_ceo"
  on public.portal_staff_announcement_acks
  for select
  to authenticated
  using (public.portal_staff_profile_is_admin_or_ceo());

-- Remove previous broadcast announcements (reminders / contracts untouched).
delete from public.portal_staff_announcements
where message_type = 'announcement';

with admin_user as (
  select sp.id
  from public.staff_profiles sp
  where sp.id is not null
    and sp.is_active is distinct from false
    and (
      sp.app_role in ('admin', 'ceo')
      or lower(coalesce(sp.username, '')) in ('victor', 'javi', 'raul', 'sevitha')
    )
  order by
    case when sp.app_role = 'ceo' then 0 when sp.app_role = 'admin' then 1 else 2 end,
    sp.created_at nulls last
  limit 1
),
portal_ready as (
  select
    'ClubSENsational Portal is ready' as title,
    'ClubSENsational Portal is now live for your day-to-day work.

Please read this notice carefully, then sign below to confirm you have understood it.

FIND THE GUIDE
Tap the club logo in the dashboard header (top of the screen). That opens Alerts and Notifications, where you will find the step-by-step Portal Guide — how to use today''s sessions, feedback, venue checks, timesheets, and more.

REPORT A PROBLEM
If you notice anything wrong — missing sessions, feedback not saving, timesheet issues, or anything else — contact an admin immediately so we can fix it.

Thank you for helping us run a smooth rollout.' as body
)
insert into public.portal_staff_announcements (
  created_by,
  title,
  body,
  message_type,
  priority,
  audience_scope,
  delivery_scope
)
select u.id, p.title, p.body, 'announcement', 'high', 'all_staff', 'everyone'
from admin_user u
cross join portal_ready p
where not exists (
  select 1
  from public.portal_staff_announcements a
  where a.message_type = 'announcement'
    and lower(trim(a.title)) = lower('ClubSENsational Portal is ready')
);

commit;
