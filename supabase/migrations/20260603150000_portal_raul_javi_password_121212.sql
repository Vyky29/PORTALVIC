-- Raúl + Javi (CEO): set Auth password to 121212 (Portal Supabase SQL Editor).
-- Requires extension pgcrypto. If login still fails, use:
--   python database/set_portal_lead_password.py raul@clubsensational.org javier@clubsensational.org
-- with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Admin API is more reliable than crypt()).

create extension if not exists pgcrypto;

update auth.users
set
  encrypted_password = crypt('121212', gen_salt('bf')),
  updated_at = now()
where lower(email) in (
  lower('raul@clubsensational.org'),
  lower('javier@clubsensational.org')
);

-- Verify (do not commit password hashes; row count only)
select id, email, updated_at
from auth.users
where lower(email) in (
  lower('raul@clubsensational.org'),
  lower('javier@clubsensational.org')
)
order by email;
