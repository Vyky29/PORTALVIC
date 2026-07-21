select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='portal_parent_invoices'
order by ordinal_position;
