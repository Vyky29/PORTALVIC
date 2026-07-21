select client_key, data->>'Services' as services
from client_payments
where data->>'Services' ~ '\d{2,3}\s*[''’′].*\s\d{2,3}\s*[''’′]';
