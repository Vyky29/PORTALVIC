-- Ahmed brothers (Adaam / Amaar / Aydaan): Autumn 26/27 booking must include
-- weekday 30' Aquatic + Sunday 90' Multi (was Multi-only → £1,560).
-- Catalogue: weekday autumn 14 × £50 + weekend autumn 13 × £120 = £2,260.

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Monday) · 90'' Multi-Activity (Sunday)',
  'Autumn 26/27 basis', '14 × £50 aquatic (Mon) + 13 × £120 multi (Sun) = £2,260'
)
where client_key in ('adaam-ah', 'adaam_ah')
  and sheet = 'LA';

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Friday) · 90'' Multi-Activity (Sunday)',
  'Autumn 26/27 basis', '14 × £50 aquatic (Fri) + 13 × £120 multi (Sun) = £2,260'
)
where client_key in ('amaar-ah', 'amaar_ah')
  and sheet = 'LA';

update public.client_payments
set data = data || jsonb_build_object(
  'Services', '30'' Aquatic Activity (Tuesday) · 90'' Multi-Activity (Sunday)',
  'Autumn 26/27 basis', '14 × £50 aquatic (Tue) + 13 × £120 multi (Sun) = £2,260'
)
where client_key in ('aydaan-ah', 'aydaan_ah')
  and sheet = 'LA';
