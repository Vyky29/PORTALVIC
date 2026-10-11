-- The duplicate trigger schedule-overrides-web-push posted with a placeholder
-- webhook secret, so every roster insert got a 403 beside the real trigger.
-- portal-push-schedule-override is the live sender. Do not recreate this one.

drop trigger if exists "schedule-overrides-web-push" on public.schedule_overrides;
