-- Amaar Ahmed (105): club cancelled Fri 17 Jul 2026 Aquatic 5.30–6 Acton.
-- Open makeup grant for Autumn 2026/27 — visible on parent hub / Report absent.
-- Not billed; does not create or alter invoices.

insert into public.portal_parent_makeup_grants (
  parent_person_id,
  contact_id,
  participant_display,
  preferred_venue,
  service_label,
  status,
  source,
  notes
)
select
  c.parent_person_id,
  c.contact_id,
  coalesce(nullif(trim(c.child_display), ''), 'Amaar Ahmed'),
  'Acton',
  'Aquatic Activity',
  'open',
  'admin',
  'Makeup due — club cancelled Fri 17 Jul 2026 Aquatic (5.30–6 Acton). Use in Autumn 2026/27. Not billed / does not appear on invoices.'
from public.portal_parent_contacts c
where c.contact_id = '105'
  and not exists (
    select 1
    from public.portal_parent_makeup_grants g
    where g.contact_id = '105'
      and g.status = 'open'
      and coalesce(g.notes, '') like '%17 Jul 2026%'
  );
