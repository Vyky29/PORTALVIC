-- Elia demo: £50 course / invoice, £25 open credit (pay £25 after apply).
-- Re-enrolment display override is in portal-reenrolment-lookup (flat £50).

begin;

update public.client_payments
set
  amount = 50.00,
  data = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(data::jsonb, '{}'::jsonb),
        '{Services}',
        to_jsonb('30'' SW (Tuesday) · demo £50 one session'::text)
      ),
      '{Cost}',
      to_jsonb('£50 / session (demo one-off)'::text)
    ),
    '{Year total}',
    to_jsonb('£50'::text)
  )
where client_key = 'elia-matilla-2526';

-- One open credit of £25 (close the old £50 credit + keep refund separate or close it)
update public.portal_parent_family_credits
set status = 'cancelled', notes = coalesce(notes, '') || ' [superseded 2026-07-09 demo £25]'
where contact_id = 'elia-matilla-demo'
  and status = 'open'
  and kind in ('credit', 'refund');

insert into public.portal_parent_family_credits (
  parent_person_id, contact_id, participant_display,
  kind, status, amount_gbp, currency, service_label, session_date, notes, source
)
values (
  'parent-victor-matilla-demo',
  'elia-matilla-demo',
  'Elia',
  'credit',
  'open',
  25.00,
  'GBP',
  'Aquatic Activity (demo £25 credit)',
  current_date - 7,
  'Demo: £50 invoice − £25 credit = £25 to pay.',
  'admin'
);

-- Align unpaid demo invoice to £50 if still open
update public.portal_parent_invoice_share
set
  amount_gbp = 50.00,
  notes = coalesce(notes, '') || ' [demo £50]',
  updated_at = now()
where contact_id = 'elia-matilla-demo'
  and invoice_number = 'TEST-ELIA-001'
  and payment_status in ('unpaid', 'partial')
  and share_status = 'ready';

commit;

select client_key, amount, data->>'Services' as services, data->>'Year total' as yt
from public.client_payments where client_key = 'elia-matilla-2526';

select kind, status, amount_gbp, notes
from public.portal_parent_family_credits
where contact_id = 'elia-matilla-demo'
order by created_at desc;

select invoice_number, amount_gbp, payment_status
from public.portal_parent_invoice_share
where contact_id = 'elia-matilla-demo' and invoice_number = 'TEST-ELIA-001';
