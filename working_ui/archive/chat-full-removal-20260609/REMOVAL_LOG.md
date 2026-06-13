# Portal chat — full removal log (2026-06-09)

**Reason:** Critical routing bug — Victor → Sevitha messages delivered to Teflon (and possibly other staff). All portal chat UI/runtime removed until a safe rebuild.

**Archive root:** `working_ui/archive/chat-full-removal-20260609/`

**Not deleted (Supabase):** Edge Functions (`portal-push-dispatch-*`), DB tables (`portal_staff_dm_*`, `portal_ceo_group_*`), migrations. Those still exist server-side but **no live portal page loads the client chat code** anymore.

---

## What was removed from production paths

### Standalone pages & manifests
- `new_chat.html` — New Chat PWA
- `cs_cliq.html` — legacy redirect
- `new-chat.webmanifest`, `cs-cliq.webmanifest`
- `portal-webpush-admin-setup.html`

### CEO shell
- Original `ceo_dashboard.html` (chat-only) → archived; live file is now a redirect to `admin_dashboard.html`

### Portal JS/CSS (53 modules under `portal/`)
All CS Cliq, DM, executive chat, web-push-for-chat, calls, and inbox modules — see file list below.

### Prior salvage
Contents of `archive/chat-v1-salvage/` merged into `prior-salvage/` here.

---

## Files archived (79 total)

- `html/ceo_dashboard.html`
- `html/cs-cliq.webmanifest`
- `html/cs_cliq.html`
- `html/new-chat.webmanifest`
- `html/new_chat.html`
- `html/portal-webpush-admin-setup.html`
- `icons/cs-cliq/apple-touch-icon.png`
- `icons/cs-cliq/icon-192.png`
- `icons/cs-cliq/icon-512.png`
- `icons/cs-cliq/icon-maskable-192.png`
- `icons/cs-cliq/icon-maskable-512.png`
- `portal-shared-js/portal_ceo_dm.mjs`
- `portal/portal-admin-web-push.js`
- `portal/portal-dm-inbox-premium.css`
- `portal/portal-internal-chat-premium.css`
- `portal/portal_admin_cs_cliq.css`
- `portal/portal_admin_cs_cliq.js`
- `portal/portal_ceo_dm.mjs`
- `portal/portal_ceo_god_mode_admin.js`
- `portal/portal_chat_actor_identity.js`
- `portal/portal_chat_message_push.js`
- `portal/portal_cs_cliq_admin_channels.js`
- `portal/portal_cs_cliq_admin_inbox.js`
- `portal/portal_cs_cliq_announcement_inbox.js`
- `portal/portal_cs_cliq_announcements_hub.js`
- `portal/portal_cs_cliq_app.css`
- `portal/portal_cs_cliq_app.js`
- `portal/portal_cs_cliq_compose_sheet.js`
- `portal/portal_cs_cliq_embed.css`
- `portal/portal_cs_cliq_embed.js`
- `portal/portal_cs_cliq_files_hub.js`
- `portal/portal_cs_cliq_group_members.js`
- `portal/portal_cs_cliq_hub.css`
- `portal/portal_cs_cliq_hub_roles.js`
- `portal/portal_cs_cliq_management_inbox.js`
- `portal/portal_cs_cliq_meetings_hub.js`
- `portal/portal_cs_cliq_paused.css`
- `portal/portal_cs_cliq_paused.js`
- `portal/portal_cs_cliq_push.js`
- `portal/portal_cs_cliq_support.js`
- `portal/portal_cs_cliq_support_route.js`
- `portal/portal_cs_cliq_teams.js`
- `portal/portal_cs_cliq_thread_files.js`
- `portal/portal_cs_cliq_thread_header.js`
- `portal/portal_cs_cliq_workspace.css`
- `portal/portal_cs_cliq_workspace.js`
- `portal/portal_dashboard_chat_stubs.js`
- `portal/portal_dm_attachments.js`
- `portal/portal_dm_composer_wa.js`
- `portal/portal_dm_executive_cliq.js`
- `portal/portal_dm_icons.js`
- `portal/portal_dm_inbox_perf.js`
- `portal/portal_dm_read_cursor.js`
- `portal/portal_dm_roles.js`
- `portal/portal_dm_thread_avatar.js`
- `portal/portal_dm_voice.js`
- `portal/portal_executive_dm.js`
- `portal/portal_floating_internal_chat.js`
- `portal/portal_incoming_call_push.js`
- `portal/portal_internal_dm_directory.js`
- `portal/portal_lead_staff_chat_directory.js`
- `portal/portal_management_dm_routing.js`
- `portal/portal_staff_chat_calls.js`
- `portal/portal_web_push_support.js`
- `portal/portal_worker_group_thread.js`
- `prior-salvage/README.md`
- `prior-salvage/portal_cs_cliq_admin_channels.js`
- `prior-salvage/portal_cs_cliq_embed.js`
- `prior-salvage/portal_cs_cliq_files_hub.js`
- `prior-salvage/portal_cs_cliq_paused.css`
- `prior-salvage/portal_cs_cliq_paused.js`
- `prior-salvage/portal_cs_cliq_support.js`
- `prior-salvage/portal_cs_cliq_support_route.js`
- `prior-salvage/portal_cs_cliq_thread_files.js`
- `prior-salvage/portal_floating_internal_chat.js`
- `prior-salvage/portal_lead_staff_chat_directory.js`
- `service-workers/working_ui-clubsensational-portal-sw.js` (pre-edit backup)
- `service-workers/working_ui-portal-clubsensational-portal-sw.js` (pre-edit backup)
- `service-workers/working_ui-portal-shared-js-clubsensational-portal-sw.js` (pre-edit backup)

---

## Live files edited (not archived)

| File | Change |
|------|--------|
| `admin_dashboard.html` | Removed ~4700 lines inline DM/CS Cliq JS; New Chat nav; floating chat button; script tags for chat modules |
| `staff_dashboard.html` | Removed ~2500 lines inline internal chat JS; chat script tags; `openSheet('internalChatSheet')` blocked |
| `lead_dashboard.html` | Removed ~1700 lines inline chat JS; chat script tags; `openSheet('internalChatSheet')` blocked |
| `ceo_dashboard.html` | Replaced with redirect to admin dashboard |
| `login.html` | New Chat sign-in theme/link stripped |
| `portal/auth-handler.js` | `new_chat` / `cs_cliq` routes disabled; redirect to dashboard |
| `portal_choose.html` | Copy no longer mentions chat |
| `serve.json` | Removed `/cs_cliq` rewrite |
| `clubsensational-portal-sw.js` (×3) | Chat push open handlers neutered |
| `scripts/remove_portal_chat_cleanup.py` | Automation used for this removal |

---

## Intentionally kept (non-chat or shared)

- `portal/portal_ops_admin_display.js` — admin display labels (not chat runtime)
- `portal/portal_admin_alerts_bell.js` — day-ops alerts bell (chat unread hooks stubbed in dashboards)
- `portal/portal-vapid-public.js` — may still be referenced by alerts UI (push subscription without chat module)
- `portal/admin_dashboard.app_.js`, `portal-shared-js/admin_dashboard.app_.js` — **still contain old chat references** (split bundle; not loaded by default HTML if unused)
- **Supabase backend** — tables, RLS, Edge Functions unchanged

---

## Restore checklist (if rebuilding chat later)

1. Copy needed files from this archive back to `working_ui/portal/` and HTML roots.
2. Fix routing bug **before** re-enabling: leadership 1:1 must never fan out to worker ops threads / `portal_staff_dm_ensure_ops_thread`.
3. Re-wire script tags in dashboards or keep chat as standalone-only with explicit peer IDs.
4. Redeploy Edge Functions only if push routing logic changes.
5. Run chat wipe SQL if test data must be cleared: `database/local-vault/step-chat-wipe-all-test-conversations.sql`

---

## Cleanup script

```bash
python3 scripts/remove_portal_chat_cleanup.py
```

Re-run only after restoring archived files to original paths.
