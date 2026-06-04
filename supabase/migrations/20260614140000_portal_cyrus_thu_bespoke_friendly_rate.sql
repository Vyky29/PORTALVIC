-- Cyrus: Thursday 90' Bespoke with Victor (SwimFarm 15:30–17:00) — friendly £90/session.
-- Standard bespoke rate £125/hour; family rate reflects 3 additional club services.

begin;

update public.client_payments cp
set data = (
  cp.data::jsonb || jsonb_build_object(
    'Cost', '£90 / session (Thu 90'' Bespoke · friendly; std £125/hr)',
    'Thursday Bespoke', '90'' Bespoke Programme · Thu 15:30–17:00 · Victor · SwimFarm Hub · £90/session',
    'Notes', coalesce(nullif(trim(cp.data->>'Notes'), ''), '')
      || case when coalesce(nullif(trim(cp.data->>'Notes'), ''), '') = '' then '' else ' · ' end
      || 'Friendly Thu bespoke £90/session (normally £125/hour); attends 3 other services with club.'
  )
)::json
where cp.sheet = 'PARENTS'
  and lower(trim(cp.client_name)) = 'cyrus';

commit;
