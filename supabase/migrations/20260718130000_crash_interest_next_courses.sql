-- Allow interest in future crash courses when July 2026 is fully booked.
ALTER TABLE public.portal_crash_summer_interest
  DROP CONSTRAINT IF EXISTS portal_crash_summer_interest_interest_type_check;

ALTER TABLE public.portal_crash_summer_interest
  ADD CONSTRAINT portal_crash_summer_interest_interest_type_check
  CHECK (interest_type IN ('individual_hours', 'waiting_list_slot', 'next_crash_courses'));

ALTER TABLE public.portal_crash_summer_interest
  DROP CONSTRAINT IF EXISTS portal_crash_summer_interest_week_id_check;

ALTER TABLE public.portal_crash_summer_interest
  ADD CONSTRAINT portal_crash_summer_interest_week_id_check
  CHECK (week_id IN ('w1', 'w2', 'next'));
