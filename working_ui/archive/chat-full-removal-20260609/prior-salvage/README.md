# Chat v1 salvage (archived for New Chat v2)

Copied from portal before stripping embedded chat from staff/lead/admin dashboards (2026-06).

## Reuse later

| File | Feature |
|------|---------|
| `portal_cs_cliq_support.js` | Staff support request types (urgent, safeguarding, staff issue, meetings) |
| `portal_cs_cliq_support_route.js` | Office/admin thread routing |
| `portal_cs_cliq_thread_files.js` | Thread file attachments panel |
| `portal_cs_cliq_admin_channels.js` | Channels UI (Leads/Staff categories, group cards) |
| `portal_cs_cliq_files_hub.js` | Files hub |
| `portal_lead_staff_chat_directory.js` | Simplified worker/lead inbox (Admin tab, support accordion) |
| `portal_floating_internal_chat.js` | Dock/header chat button wiring |
| `portal_cs_cliq_embed.js` | Full-screen embed shell (deprecated) |
| `portal_cs_cliq_paused.js` | “Under construction” bridge |

## Active app

**New Chat** (`new_chat.html`) — standalone PWA; phase 1 = admin ↔ CEO only.

Legacy URL `cs_cliq.html` redirects to `new_chat.html` for existing home-screen installs.
