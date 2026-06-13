#!/usr/bin/env python3
"""Strip embedded chat from portal HTML/JS after archiving chat modules."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "working_ui"

CHAT_SCRIPT_RE = re.compile(
    r'\s*<script[^>]*src="[^"]*(?:'
    r"portal_cs_cliq|portal_dm_|portal_executive_dm|portal_internal_dm|"
    r"portal_management_dm|portal_ceo_dm|portal_ceo_god_mode|portal_chat_|"
    r"portal_dashboard_chat_stubs|portal_floating_internal|portal_lead_staff_chat|"
    r"portal_staff_chat_calls|portal_worker_group|portal-admin-web-push|"
    r"portal_incoming_call|portal_web_push_support|portal_admin_cs_cliq|"
    r"portal_dm_roles\.js"
    r')[^"]*"[^>]*></script>\s*',
    re.I,
)

CHAT_LINK_RE = re.compile(
    r'\s*<link[^>]*href="[^"]*(?:'
    r"portal-internal-chat|portal-dm-inbox|portal_admin_cs_cliq|portal_cs_cliq"
    r')[^"]*"[^>]*>\s*',
    re.I,
)

STUB = """
    /* Chat removed 2026-06-09 — archived under working_ui/archive/chat-full-removal-20260609/ */
    window.portalRenderInternalChatSheet = async function(){};
    window.portalInitFloatingInternalChat = function(){};
    window.portalStaffDmSyncUnreadChrome = async function(){};
    window.portalStaffDmOnRealtimeInsert = async function(){ return false; };
    window.portalSyncInternalChatSheetView = function(){};
    window.portalSyncInternalChatMobileViewport = function(){};
    window.portalInitStaffDmRealtime = function(){};
    window.portalInitStaffDmUnreadPoll = function(){};
    window.portalAdminBootDmWatchers = function(){};
    window.portalAdminDmHasUnread = function(){ return false; };
    window.portalAdminBellResolveChatHints = function(){ return []; };
    window.portalPlayChatMessageAlertSound = function(){};
"""


def drop_line_range(text: str, start: int, end: int) -> str:
    lines = text.splitlines(keepends=True)
    if start < 1 or end > len(lines) or start > end:
        return text
    return "".join(lines[: start - 1] + [STUB + "\n"] + lines[end:])


def clean_html(path: Path, line_ranges: list[tuple[int, int]] | None = None) -> bool:
    if not path.exists():
        return False
    orig = path.read_text(encoding="utf-8")
    text = orig
    text = CHAT_SCRIPT_RE.sub("\n", text)
    text = CHAT_LINK_RE.sub("\n", text)
    if line_ranges:
        # apply from bottom to top
        for start, end in sorted(line_ranges, reverse=True):
            text = drop_line_range(text, start, end)
    # common string patches
    text = text.replace("Chat, reminders and activity alerts.", "Reminders and activity alerts.")
    text = text.replace(
        "Chat, late submission requests, and activity alerts.",
        "Late submission requests and activity alerts.",
    )
    text = re.sub(
        r'\s*<div class="portal-admin-floating-chat-wrap[^"]*"[^>]*>.*?</div>\s*',
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*<script>\s*\(function\(\)\{\s*if\(window\.PORTAL_CS_CLIQ_PAUSED\).*?portalAdminBootDmWatchers.*?\}\)\(\);\s*</script>\s*",
        "\n",
        text,
        flags=re.S,
    )
    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def clean_login(path: Path) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    orig = text
    # Remove New Chat entry link block
    text = re.sub(
        r'\s*<p class="login-cs-cliq-entry"[^>]*>.*?</p>\s*',
        "\n",
        text,
        flags=re.S,
    )
    # Remove cs-cliq theme CSS block (lines between login-theme-cs-cliq comment and next major section)
    text = re.sub(
        r"\n\s*/\* New Chat PWA sign-in.*?\n\s*\.login-theme-cs-cliq \.btn-login\{[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\n\s*\.login-theme-cs-cliq[^}]+\}\n(?:\s*\.login-theme-cs-cliq[^}]+\}\n)*",
        "\n",
        text,
    )
    text = re.sub(
        r"\n\s*\.login-cs-cliq-entry[^}]+\}\n(?:\s*\.login-cs-cliq-entry[^}]+\}\n)*",
        "\n",
        text,
    )
    if text != orig:
        path.write_text(text, encoding="utf-8")


def clean_auth_handler(path: Path) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    orig = text
    # Neutralize new_chat / cs_cliq login app detection — keep file valid
    text = text.replace('app === "new_chat"', "false /* chat removed */")
    text = text.replace('app === "cs_cliq"', "false /* chat removed */")
    text = text.replace("__PORTAL_LOGIN_CS_CLIQ__", "false")
    text = text.replace("__PORTAL_LOGIN_NEW_CHAT__", "false")
    if text != orig:
        path.write_text(text, encoding="utf-8")


def clean_sw(path: Path) -> None:
    """Service worker left intact — chat fields in push payloads are harmless without chat UI."""
    return


def patch_admin_dashboard(path: Path) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    orig = text
    text = drop_line_range(text, 20272, 24921)
    # Nav: remove New Chat
    text = re.sub(
        r"\s*\{ id:'portal_nav_new_chat'[^}]+\},?\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*\{ id:'g_new_chat'[^}]+\},?\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*portal_nav_new_chat:'[^']+',?\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*g_new_chat:'[^']+',?\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*cs_cliq: true,?\n",
        "\n",
        text,
    )
    text = re.sub(
        r"function portalAdminOpenNewChat\(extra\)\{[^}]+\{[^}]+\}[^}]+\}\n",
        "function portalAdminOpenNewChat(){ /* chat removed */ }\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"function openDayOpsAdminChatHubModal\(\)\{[^}]+\}\n",
        "function openDayOpsAdminChatHubModal(){ /* chat removed */ }\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"function viewCsCliq\(\)\{[^}]+\{[^}]+\}[^}]+\}\n",
        "function viewCsCliq(){ return '<h1 class=\"page-title\">Messaging removed</h1><p class=\"page-intro\">Internal chat has been disabled.</p>'; }\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"else if\(id==='cs_cliq'\) html = viewCsCliq\(\);\n",
        "",
        text,
    )
    text = re.sub(
        r"portalDashTileHtml\('[^']*', '[^']*', 'comms_ops', 'Chat',[^)]+\)\+",
        "",
        text,
    )
    # Remove chat unread in alerts
    text = re.sub(
        r"\s*if\(portalAdminDmHasUnread\(\)\)\{[^}]+\}[^}]+\}[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(id === 'cs_cliq'\)\{[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(state\.view === 'cs_cliq'[^}]+\}[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"document\.body\.classList\.toggle\('admin-view-cs-cliq'[^)]+\);\n",
        "",
        text,
    )
    text = re.sub(
        r"\s*try\{ portalAdminDmPatchGlobalChatBanner\(\);[^}]+\}\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*try\{\s*portalAdminBootDmWatchers\(\);[^}]+\}catch\(_dm[^)]*\)\{\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(typeof window\.portalInitFloatingInternalChat[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(\s*state\.view === 'cs_cliq'[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(s\.action==='chat_hub'\)[^;]+;\n",
        "\n",
        text,
    )
    text = re.sub(
        r"\s*if\(a === 'admin_chat_hub'\)\{[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*if\(portalAdminDmPremiumActive\(\)\)\{[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\s*document\.body\.classList\.remove\('admin-cs-cliq-mobile-subscreen'\);\n",
        "",
        text,
    )
    text = re.sub(
        r"\s*if\(state\.view === 'cs_cliq' && portalAdminDmCsCliqEmbedActive\(\)\)\{[^}]+\}\n",
        "\n",
        text,
        flags=re.S,
    )
    if text != orig:
        path.write_text(text, encoding="utf-8")


def main() -> None:
    clean_html(UI / "staff_dashboard.html", [(7154, 9620)])
    clean_html(UI / "lead_dashboard.html", [(5994, 7740)])
    clean_html(UI / "admin_dashboard.html")
    patch_admin_dashboard(UI / "admin_dashboard.html")
    clean_html(UI / "ceo_dashboard.html")
    clean_login(UI / "login.html")
    clean_auth_handler(UI / "portal" / "auth-handler.js")
    for sw in [
        UI / "clubsensational-portal-sw.js",
        UI / "portal" / "clubsensational-portal-sw.js",
        UI / "portal-shared-js" / "clubsensational-portal-sw.js",
    ]:
        clean_sw(sw)
    print("cleanup done")


if __name__ == "__main__":
    main()
