-- Remove feedback_done quick marks that blocked staff tablets without a session_feedback row.
-- Safe to re-run: only deletes quick marks with no matching submitted feedback.

DELETE FROM public.portal_staff_session_quick_marks q
WHERE q.mark_type = 'feedback_done'
  AND q.session_date >= '2026-06-10'
  AND NOT EXISTS (
    SELECT 1
    FROM public.session_feedback sf
    WHERE sf.portal_session_key = q.portal_session_key
      AND sf.session_date = q.session_date
  );
