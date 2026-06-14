-- Climbing keys use trailing area token (|wall). Old parsers treated "Wall" as the participant.
-- Remove mistaken absent quick marks on real client keys so staff can submit feedback (e.g. Scott 14 Jun).

begin;

delete from public.portal_staff_session_quick_marks q
where q.mark_type = 'absent'
  and q.session_date >= '2026-06-01'
  and q.portal_session_key ~ '^\d{4}-\d{2}-\d{2}\|\d{1,2}:\d{2}\|'
  and q.portal_session_key ~ '\|(scott|yusuf_ah|yusuf|eiji|rodin|ayden)(\|wall|\|climbing_wall|$)';

delete from public.session_feedback sf
where sf.session_date >= '2026-06-01'
  and lower(trim(coalesce(sf.attendance, ''))) in ('no', 'n')
  and lower(trim(coalesce(sf.client_name, ''))) in ('wall', 'climbing wall', 'climbing_wall')
  and sf.portal_session_key ~* '(scott|yusuf|yusuf_ah|eiji|rodin|ayden)';

commit;
