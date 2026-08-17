-- Potential-client tracking on booking leads (office CRM).
-- track_status: office pipeline. When not "booked", email joins marketing outreach.

begin;

alter table public.portal_booking_leads
  add column if not exists enquiry_notes text not null default '';

alter table public.portal_booking_leads
  add column if not exists activity_interest text not null default '';

alter table public.portal_booking_leads
  add column if not exists track_status text not null default 'new';

alter table public.portal_booking_leads
  drop constraint if exists portal_booking_leads_track_status_check;

alter table public.portal_booking_leads
  add constraint portal_booking_leads_track_status_check
  check (track_status in (
    'new',
    'following_up',
    'waiting',
    'not_booking',
    'booked',
    'closed'
  ));

alter table public.portal_booking_leads
  add column if not exists outreach_joined_at timestamptz null;

create index if not exists portal_booking_leads_track_status_idx
  on public.portal_booking_leads (track_status, updated_at desc);

create index if not exists portal_booking_leads_outreach_idx
  on public.portal_booking_leads (outreach_joined_at desc nulls last)
  where outreach_joined_at is not null;

comment on column public.portal_booking_leads.enquiry_notes is
  'Office free-text enquiry / notes for potential client tracking.';
comment on column public.portal_booking_leads.activity_interest is
  'Activity or service the family asked about (office).';
comment on column public.portal_booking_leads.track_status is
  'Office CRM status. Anything other than booked joins marketing outreach.';
comment on column public.portal_booking_leads.outreach_joined_at is
  'When email was added to marketing outreach (status ≠ booked).';

commit;
