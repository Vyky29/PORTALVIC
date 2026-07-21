select contact_id, child_display, parent_display, parent_first_name, parent_last_name, email, mobile, registration_date
from portal_parent_contacts
where child_display ilike '%zakariya%'
   or parent_display ilike '%catarina%'
   or parent_display ilike '%silva%'
   or parent_last_name ilike '%silva%'
   or email ilike '%silva%'
   or email ilike '%catarina%'
   or email ilike '%mariana%';

select column_name from information_schema.columns
where table_schema='public' and table_name='portal_parent_invoices'
order by ordinal_position;
