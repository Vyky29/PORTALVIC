-- Mirror of supabase/migrations/20260625133000_portal_announcement_ack_insert_all_scopes.sql

-- Fix: staff signatures on role-targeted / leads / single-user announcements were
-- rejected by RLS, so an acknowledged announcement (e.g. one sent by the CEO to a
-- specific staff role) kept reappearing as "new" on any session that relies on the
-- server (other device, cleared cache, volatile PWA storage, or after ack merge).
--
-- The INSERT check on portal_staff_announcement_acks was narrower than the worker
-- inbox visibility rules in portal_announcement_ack.js
-- (portalStaffAnnouncementRowVisibleOnWorkerInbox). Realign them so a worker can
-- persist a signature for every announcement they can actually see.

begin;

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
          -- Directed to one person (any audience scope).
          (
            a.delivery_scope = 'single_user'
            and a.target_user_id = auth.uid()
          )
          -- Broadcast to all staff (active worker, lead, admin or ceo).
          or (
            a.delivery_scope = 'everyone'
            and a.audience_scope = 'all_staff'
            and a.target_user_id is null
            and coalesce(a.target_staff_role, '') = ''
            and exists (
              select 1 from public.staff_profiles sp
              where sp.id = auth.uid() and sp.is_active is distinct from false
            )
          )
          -- Leads broadcast (leads, plus admin/ceo who share the leads inbox).
          or (
            a.delivery_scope = 'everyone'
            and a.audience_scope = 'leads'
            and (
              exists (
                select 1 from public.staff_profiles sp
                where sp.id = auth.uid() and sp.app_role = 'lead'
              )
              or public.portal_staff_profile_is_admin_or_ceo()
            )
          )
          -- Targeted to a staff role (worker whose staff_role matches).
          or (
            a.delivery_scope = 'staff_role'
            and a.audience_scope = 'all_staff'
            and coalesce(a.target_staff_role, '') <> ''
            and exists (
              select 1 from public.staff_profiles sp
              where sp.id = auth.uid()
                and sp.is_active is distinct from false
                and sp.staff_role = a.target_staff_role
            )
          )
        )
    )
  );

commit;
