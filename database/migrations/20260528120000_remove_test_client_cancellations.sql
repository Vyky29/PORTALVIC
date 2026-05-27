-- Remove smoke-test cancellation rows (Victor Matilla, 2026-05-22).
DELETE FROM public.cancellation_reports
WHERE lower(trim(client_name)) = 'test client';
