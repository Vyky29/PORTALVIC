select client_key, client_name, parent_name, payment_status, amount, sheet, data::text as data
from client_payments
where client_name ilike '%kacem%' or client_name ilike '%hazem%'
   or client_name ilike '%eiji%' or client_name ilike '%kei%'
   or parent_name ilike '%sekel%' or parent_name ilike '%lea%';
