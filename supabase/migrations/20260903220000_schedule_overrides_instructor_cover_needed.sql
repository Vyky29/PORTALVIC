-- Allow Session Disruption validate → Schedule & Covers "COVER NEEDED" placeholders.
-- instructor_cover_needed: absent staff removed for that day; slot stays booked for the
-- participant with covering_staff_name = COVER NEEDED until admin assigns a real cover.
-- Parents must NOT be notified for this type (office assigns cover first).

begin;

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
      'instructor_cover_needed',
      'slot_close',
      'slot_open',
      'override_void',
      'session_add',
      'slot_update'
    )
  );

commit;
