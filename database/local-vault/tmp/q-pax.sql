select contact_id, display_name, funding_type, funding_label, purchase_order, po_number, client_ref from public.portal_participants where lower(display_name) like '%elia%' limit 5;
