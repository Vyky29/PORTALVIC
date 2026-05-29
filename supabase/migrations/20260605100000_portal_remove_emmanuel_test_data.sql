-- Remove Emmanuel test data (was all smoke-test). Emmanuel's real schedule starts 2026-06-12.
-- Deletes feedback + related client-keyed rows. Idempotent (safe to re-run).
begin;

delete from public.session_feedback
where lower(trim(client_name)) = 'emmanuel'
   or lower(coalesce(portal_session_key, '')) like '%|emmanuel';

delete from public.incident_reports
where lower(trim(client_name)) = 'emmanuel';

delete from public.cancellation_reports
where lower(trim(client_name)) = 'emmanuel';

delete from public.lead_session_reports
where lower(trim(coalesce(client_name, ''))) = 'emmanuel'
   or lower(coalesce(portal_session_key, '')) like '%|emmanuel';

delete from public.participant_achievement_photos
where lower(trim(client_name)) = 'emmanuel';

delete from public.portal_late_submission_requests
where lower(trim(coalesce(client_name, ''))) = 'emmanuel'
   or lower(coalesce(portal_session_key, '')) like '%|emmanuel';

commit;
