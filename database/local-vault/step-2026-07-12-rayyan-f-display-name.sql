-- Unify Rayyan display name with clients_info / portal_session_key (rayyan_f).
-- Roster historically used "Rayyan Fi"; feedback and keys use "Rayyan F".

begin;

update public.session_feedback
set client_name = 'Rayyan F'
where client_name = 'Rayyan Fi';

update public.portal_participant_achievement_photos
set client_name = 'Rayyan F'
where client_name = 'Rayyan Fi';

commit;
