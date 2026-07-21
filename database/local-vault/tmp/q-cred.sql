select table_name from information_schema.tables
where table_schema='public' and table_name ilike '%credit%';

select * from portal_parent_credits where contact_id = '42' limit 20;
