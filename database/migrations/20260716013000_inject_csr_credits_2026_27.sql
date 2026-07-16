-- Open family credits from client_services_review CREDITS (£) for 2026/27.
-- Source export: client_services_reviewed.json (82 clients; 6 with creditBalance > 0).
-- Idempotent: skips if an open credit already exists for the same contact + amount + note marker.

insert into public.portal_parent_family_credits (
  parent_person_id,
  contact_id,
  participant_display,
  kind,
  status,
  amount_gbp,
  currency,
  service_label,
  notes,
  source
)
select
  c.parent_person_id,
  c.contact_id,
  c.child_display,
  'credit',
  'open',
  v.amount_gbp,
  'GBP',
  'Carry-forward credit 2026/27',
  'From client_services_review CREDITS (£) export 2026-07-16 — for Autumn 2026/27',
  'admin'
from (
  values
    ('79'::text, 90::numeric),
    ('54', 70),
    ('58', 70),
    ('236', 50),
    ('376', 50),
    ('92', 50)
) as v(contact_id, amount_gbp)
join public.portal_parent_contacts c
  on c.contact_id = v.contact_id
where not exists (
  select 1
  from public.portal_parent_family_credits x
  where x.contact_id = v.contact_id
    and x.kind = 'credit'
    and x.status = 'open'
    and x.amount_gbp = v.amount_gbp
    and coalesce(x.notes, '') like '%client_services_review CREDITS%'
);
