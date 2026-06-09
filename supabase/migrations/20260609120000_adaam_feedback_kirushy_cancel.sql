-- Adaam Ah feedback client_name fix + Kirushy permanent Monday cancellation (Portal).
-- Applied via database/local-vault/step-adaam-kirushy-2026-06-09.sql on 2026-06-09.

update public.session_feedback
set client_name = 'Adaam Ah'
where session_date = '2026-06-08'
  and portal_session_key = '2026-06-08|18:00|adaam_ah'
  and lower(trim(client_name)) in ('aadam ah', 'adaam ah');

-- schedule_overrides rows inserted idempotently by local-vault script (see repo history).
