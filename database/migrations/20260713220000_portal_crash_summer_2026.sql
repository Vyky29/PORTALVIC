-- Summer holiday crash courses (July 2026): climbing + swimming slot bookings.
-- Capacity: climbing 1 place per 60′ hour (1 instructor) · swimming 2 places per 30′ band
-- (2 instructors) = 8×30′ units/day. Place held only while awaiting_payment
-- (hold TTL) or confirmed after pay-in-full.

CREATE TABLE IF NOT EXISTS public.portal_crash_summer_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id text NOT NULL,
  parent_person_id text NOT NULL,
  week_id text NOT NULL CHECK (week_id IN ('w1', 'w2')),
  booking_mode text NOT NULL CHECK (booking_mode IN ('weekly_pack', 'individual_days')),
  activities text[] NOT NULL,
  amount_gbp numeric(10, 2) NOT NULL CHECK (amount_gbp > 0),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'confirmed', 'cancelled', 'expired')),
  invoice_share_id uuid NULL REFERENCES public.portal_parent_invoice_share (id) ON DELETE SET NULL,
  hold_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

CREATE INDEX IF NOT EXISTS portal_crash_summer_bookings_contact_idx
  ON public.portal_crash_summer_bookings (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS portal_crash_summer_bookings_invoice_idx
  ON public.portal_crash_summer_bookings (invoice_share_id)
  WHERE invoice_share_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS portal_crash_summer_bookings_status_idx
  ON public.portal_crash_summer_bookings (status, hold_expires_at);

CREATE TABLE IF NOT EXISTS public.portal_crash_summer_booking_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.portal_crash_summer_bookings (id) ON DELETE CASCADE,
  activity text NOT NULL CHECK (activity IN ('climbing', 'swimming')),
  session_date date NOT NULL,
  slot_id text NOT NULL,
  slot_label text NOT NULL,
  unit_price_gbp numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_crash_summer_lines_booking_idx
  ON public.portal_crash_summer_booking_lines (booking_id);

CREATE INDEX IF NOT EXISTS portal_crash_summer_lines_slot_lookup_idx
  ON public.portal_crash_summer_booking_lines (activity, session_date, slot_id, status);

-- One child place per activity/date/slot while held or confirmed.
CREATE UNIQUE INDEX IF NOT EXISTS portal_crash_summer_slot_unique_active
  ON public.portal_crash_summer_booking_lines (activity, session_date, slot_id)
  WHERE status IN ('awaiting_payment', 'confirmed');

ALTER TABLE public.portal_crash_summer_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_crash_summer_booking_lines ENABLE ROW LEVEL SECURITY;

-- Service role / edge only (no direct anon client access).
DROP POLICY IF EXISTS portal_crash_summer_bookings_deny_all ON public.portal_crash_summer_bookings;
CREATE POLICY portal_crash_summer_bookings_deny_all
  ON public.portal_crash_summer_bookings
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS portal_crash_summer_lines_deny_all ON public.portal_crash_summer_booking_lines;
CREATE POLICY portal_crash_summer_lines_deny_all
  ON public.portal_crash_summer_booking_lines
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.portal_crash_summer_bookings IS
  'Summer Jul 2026 crash course bookings; confirmed only after invoice paid in full.';
COMMENT ON TABLE public.portal_crash_summer_booking_lines IS
  'Per-day slot lines for summer crash; unique active slot enforces capacity.';
