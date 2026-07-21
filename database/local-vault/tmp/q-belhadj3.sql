select client_key, client_name, services_count, sessions::text as sessions
from portal_participant_service_lines
where client_name ilike '%eiji%' or client_name ilike '%hazem%'
   or client_name ilike '%belhadj%'
   or client_key in ('eiji','hazem','kacem','kacem_eiji','hazem_kei');
