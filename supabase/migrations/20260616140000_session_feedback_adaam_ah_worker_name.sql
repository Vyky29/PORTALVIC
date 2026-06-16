-- Canonical worker short label for Adaam Ahmed: Adaam Ah (not Aadam Ah).
-- Full registration name stays in clients_info / admin; session_feedback uses roster label.

UPDATE public.session_feedback
SET
  client_name = 'Adaam Ah',
  client_id = 'adaam_ah'
WHERE client_id IN ('aadam_ah', 'adaam_ah')
   OR client_name ILIKE 'Aadam Ah';
