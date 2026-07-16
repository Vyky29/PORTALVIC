-- Additional invoice lines available in the admin Xero product map.

insert into public.portal_xero_product_map (service_key, label, sort_order)
values
  ('TRANSPORT', 'Transport', 70),
  ('CREDIT', 'Credit', 80)
on conflict (service_key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  updated_at = now();
