select contact_id, child_display, funding_label, payment_method_label from public.portal_parent_contacts where lower(child_display) like '%elia%' or lower(contact_id) like '%elia%' limit 10;
