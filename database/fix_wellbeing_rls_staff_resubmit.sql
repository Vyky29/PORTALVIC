-- Fix: staff wellbeing resubmit blocked when admin has opened 1-to-1 (status = in_progress).
-- Symptom: "new row violates row-level security policy (USING expression)"
-- Cause: upsert updates existing row; update policy did not include in_progress.
-- Run in Supabase SQL Editor (project cklpnwhlqsulpmkipmqb).

drop policy if exists "portal_wellbeing_checkins_update_own_draft" on public.portal_staff_wellbeing_checkins;

create policy "portal_wellbeing_checkins_update_own_draft"
  on public.portal_staff_wellbeing_checkins
  for update
  to authenticated
  using (
    staff_user_id = auth.uid()
    and status in (
      'all_clear',
      'needs_1to1',
      'awaiting_1to1',
      'in_progress',
      'completed',
      'monitoring'
    )
  )
  with check (staff_user_id = auth.uid());
