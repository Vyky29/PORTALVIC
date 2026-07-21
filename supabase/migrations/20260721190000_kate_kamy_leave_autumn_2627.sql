-- Kate Fordham + Kamy Akhavan: leave Autumn 26/27 (no re-enrolment).
-- Applied live 2026-07-21: DELETE Autumn ACAT client_payments; office withdraw submissions;
-- portal_parent_contacts labelled Not continuing 26/27.
-- Keep Summer 25/26 Paid rows.

delete from public.client_payments
where client_key in ('kate', 'kamy')
  and coalesce(data->>'Term', '') ilike '%AUTUMN%26/27%';
