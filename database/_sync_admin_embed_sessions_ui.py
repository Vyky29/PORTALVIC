# -*- coding: utf-8 -*-
"""Sync sessions hub + feedback UI from admin_dashboard.html → portal/admin_embed.html."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AD = ROOT / "working_ui" / "admin_dashboard.html"
EMB = ROOT / "working_ui" / "portal" / "admin_embed.html"

ad = AD.read_text(encoding="utf-8")
emb = EMB.read_text(encoding="utf-8")

# CSS
css_start = ad.index("    .portal-live-presence{")
css_end = ad.index("    .c4k-sessions-hub-tab{")
css_new = ad[css_start:css_end]
old_css_start = emb.index("    /* Sessions Overview hub")
old_css_end = emb.index("    .c4k-sessions-hub-tab{")
emb = (
    emb[:old_css_start]
    + "    /* Sessions Overview hub (portal-import-bundle week + Day ops tabs) */\n"
    + css_new
    + emb[old_css_end:]
)

emb = emb.replace(
    '    <div class="admin-main">\n      <main class="admin-workspace" id="workspace"></main>\n    </div>',
    '    <div class="admin-main">\n      <div id="portalLivePresenceBar" class="portal-live-presence" hidden aria-live="polite"></div>\n      <main class="admin-workspace" id="workspace"></main>\n    </div>',
    1,
)

js_start = ad.index("    function sessionsHubTabsHtml(activeTab){")
js_end = ad.index("    function adminListSessionFeedbackInstructors(){")
emb = (
    emb[: emb.index("    function sessionsHubTabsHtml(activeTab){")]
    + ad[js_start:js_end]
    + emb[emb.index("    function adminListSessionFeedbackInstructors()") :]
)

old_refresh = """      var fbr = $('c4kHubFbWeekRange');
      if(fbr) fbr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      if(h.tab === 'overview' && h.sfSection === 'main'){"""
new_refresh = """      var fbr = $('c4kHubFbWeekRange');
      if(fbr) fbr.textContent = sessionsHubWeekRangeLabel(h.weekAnchorIso);
      var wn = $('c4kHubWeekNavWrap');
      if(wn) wn.hidden = h.tab !== 'overview';
      var head = document.querySelector('.c4k-sessions-hub__head');
      if(head) head.outerHTML = sessionsHubHeadHtml(h.tab);
      if(h.tab === 'overview' && h.sfSection === 'main'){"""
if old_refresh in emb:
    emb = emb.replace(old_refresh, new_refresh, 1)

fn_start = ad.index("    function c4kSessionFeedbackPanelInnerHtml(){")
fn_end = ad.index("    function bindSessionsHubModule(){")
emb = (
    emb[: emb.index("    function c4kSessionFeedbackPanelInnerHtml(){")]
    + ad[fn_start:fn_end]
    + emb[emb.index("    function bindSessionsHubModule()") :]
)

bind_start = ad.index("      bindSessionFeedbackModule();")
bind_end = ad.index("    }\n\n\n    function viewC4kSessions(){")
emb = (
    emb[: emb.index("      bindSessionFeedbackModule();")]
    + ad[bind_start:bind_end]
    + emb[emb.index("    }\n\n\n    function viewC4kSessions(){") :]
)

v_start = ad.index("    function viewC4kSessions(){")
v_end = ad.index("    function viewC4kPaymentsView(){")
emb = (
    emb[: emb.index("    function viewC4kSessions(){")]
    + ad[v_start:v_end]
    + emb[emb.index("    function viewC4kPaymentsView()") :]
)

emb = emb.replace(
    "      bindSessionFeedbackTbodyClicks();\n    }",
    "      bindSessionFeedbackTbodyClicks();\n      sessionsHubStampRefresh();\n    }",
    1,
)

replacements = [
    (
        "Demo · 18 sessions with scores · from 13 Apr 2026. Load <code>session_feedback_portal_data.js</code> for live stats.",
        "Illustrative engagement data.",
    ),
    (
        "Load <code>session_feedback_portal_data.js</code> for absence / cancellation split.",
        "No attendance split in demo mode.",
    ),
    ("</strong> (workbook scope);", "</strong>;"),
    (
        '<p class="muted card-pad" style="margin:0;border-top:1px solid var(--line);font-size:12px;max-width:52rem;min-width:0;overflow-wrap:break-word">Feedback chips use <code>session_feedback_status_portal_data.js</code> (absent = done; shared units per FEEDBACK-COMPLETION-LOGIC.md).</p></div>',
        "</div>",
    ),
]
for old, new in replacements:
    emb = emb.replace(old, new)

dr_start = ad.index("    function viewC4kDailyRegistersView(){")
dr_end = ad.index("    function viewC4kInstructorReviews(){")
emb = (
    emb[: emb.index("    function viewC4kDailyRegistersView(){")]
    + ad[dr_start:dr_end]
    + emb[emb.index("    function viewC4kInstructorReviews()") :]
)

EMB.write_text(emb, encoding="utf-8", newline="\n")
print("admin_embed patched OK")
