-- Allow admin to mark a spreadsheet-closed block as reopened for staff (slot_open).
-- Keeps slot_close in check for legacy rows.

alter table public.schedule_overrides
  drop constraint if exists schedule_overrides_override_type_check;

alter table public.schedule_overrides
  add constraint schedule_overrides_override_type_check
  check (
    override_type in (
      'client_absence_announced',
      'slot_clear_client',
      'client_replace_in_slot',
      'instructor_reassign',
      'slot_close',
      'slot_open',
      'override_void'
    )
  );
