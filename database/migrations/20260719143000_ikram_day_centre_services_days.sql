-- Ikram Day Centre autumn parse: one day per segment (include Tuesday, no duplicate Friday).
update public.client_payments
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{Services}',
  to_jsonb(
    '300'' Day Centre, Monday - 11 to 4 · 300'' Day Centre, Tuesday - 11 to 4 · 300'' Day Centre, Wednesday - 11 to 4 · 300'' Day Centre, Friday - 11 to 4'::text
  )
)
where client_key = 'ikram-omar'
  and coalesce(data->>'Term', '') ilike '%summer%';
