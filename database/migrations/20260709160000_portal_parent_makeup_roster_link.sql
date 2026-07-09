-- Makeup accept → roster: store open-slot override link + optional anchors on the offer.

alter table public.portal_parent_makeup_offers
  add column if not exists roster_override_id uuid null,
  add column if not exists roster_applied_at timestamptz null,
  add column if not exists anchor_staff_id text not null default '',
  add column if not exists anchor_start time null,
  add column if not exists anchor_end time null;

create index if not exists portal_parent_makeup_offers_roster_override_idx
  on public.portal_parent_makeup_offers (roster_override_id)
  where roster_override_id is not null;

comment on column public.portal_parent_makeup_offers.roster_override_id is
  'schedule_overrides.id written when parent Accepts (open-slot MakeUp).';

comment on column public.portal_parent_makeup_offers.anchor_staff_id is
  'Roster staff key for the offered slot (e.g. roberto). Filled at offer or derived from instructor_name on accept.';
