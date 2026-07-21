-- Kate Fordham + Kamy Akhavan: keep Summer 25/26; do not bill Autumn 26/27
-- until they complete re-enrolment.
--
-- Live 2026-07-21: DELETE only Autumn ACAT client_payments for kate/kamy.
-- Summer Paid rows must remain. They stay ACAT members for current/summer.

delete from public.client_payments
where client_key in ('kate', 'kamy')
  and coalesce(data->>'Term', '') ilike '%AUTUMN%26/27%';
