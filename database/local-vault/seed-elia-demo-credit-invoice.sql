-- Seed demo credit + refund for Elia parent portal testing.

insert into public.portal_parent_family_credits (
  parent_person_id, contact_id, participant_display,
  kind, status, amount_gbp, currency, service_label, session_date, notes, source
)
select
  'parent-victor-matilla-demo',
  'elia-matilla-demo',
  'Elia',
  'credit',
  'open',
  50.00,
  'GBP',
  'Aquatic Activity (demo credit)',
  current_date - 7,
  'Demo credit seeded for parent portal test — apply to invoice (partial OK).',
  'admin'
where not exists (
  select 1 from public.portal_parent_family_credits
  where contact_id = 'elia-matilla-demo'
    and kind = 'credit'
    and status = 'open'
    and notes like 'Demo credit seeded%'
);

insert into public.portal_parent_family_credits (
  parent_person_id, contact_id, participant_display,
  kind, status, amount_gbp, currency, service_label, session_date, notes, source
)
select
  'parent-victor-matilla-demo',
  'elia-matilla-demo',
  'Elia',
  'refund',
  'open',
  25.00,
  'GBP',
  'Multi-Activity (demo refund)',
  current_date - 14,
  'Demo refund seeded for parent portal test — office marks refunded after bank transfer.',
  'admin'
where not exists (
  select 1 from public.portal_parent_family_credits
  where contact_id = 'elia-matilla-demo'
    and kind = 'refund'
    and status = 'open'
    and notes like 'Demo refund seeded%'
);

select id, kind, status, amount_gbp, service_label
from public.portal_parent_family_credits
where contact_id = 'elia-matilla-demo'
order by created_at desc;
