-- Interest list for Summer crash individual / leftover hours
-- (parents register before Fri 17 window so staff know who to follow up).

CREATE TABLE IF NOT EXISTS public.portal_crash_summer_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id text NOT NULL,
  parent_person_id text NOT NULL,
  week_id text NOT NULL CHECK (week_id IN ('w1', 'w2')),
  interest_type text NOT NULL DEFAULT 'individual_hours'
    CHECK (interest_type IN ('individual_hours', 'waiting_list_slot')),
  slot_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_crash_summer_interest_week_idx
  ON public.portal_crash_summer_interest (week_id, created_at DESC);

CREATE INDEX IF NOT EXISTS portal_crash_summer_interest_contact_idx
  ON public.portal_crash_summer_interest (contact_id, week_id);

ALTER TABLE public.portal_crash_summer_interest ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.portal_crash_summer_interest TO service_role;
