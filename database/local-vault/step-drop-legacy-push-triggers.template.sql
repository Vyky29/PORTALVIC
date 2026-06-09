-- Drop duplicate Dashboard webhooks on chat tables (keep portal-staff-dm-* SQL triggers).
-- Run: node database/local-vault/apply-drop-legacy-push-triggers.mjs

drop trigger if exists "portal-push-admin-chat" on public.portal_staff_dm_messages;
drop trigger if exists "portal-push-admin-ceo-group" on public.portal_ceo_group_message;
