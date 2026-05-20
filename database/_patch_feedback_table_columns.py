# -*- coding: utf-8 -*-
"""Sync feedback table column fixes from admin_dashboard.html to admin_embed.html."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "working_ui" / "admin_dashboard.html"
DST = ROOT / "working_ui" / "portal" / "admin_embed.html"

MARKERS = [
    "function adminC4kSessionFeedbackEngagementHeaderHtml(){",
    "function adminC4kSessionFeedbackMainTableHeadHtml(){",
    "function bookingFormatDdMmYy(iso){",
    "function adminC4kRegisterReviewedByCellHtml(d){",
]

def extract_block(text: str, start_marker: str, end_marker: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


def main():
    src = SRC.read_text(encoding="utf-8")
    dst = DST.read_text(encoding="utf-8")
    if "function adminC4kSessionFeedbackMainTableHeadHtml" in dst:
        print("Already synced:", DST)
        return

    block = extract_block(
        src,
        "function adminC4kSessionFeedbackEngagementHeaderHtml(){",
        "function adminC4kRegistersKpiEngagementPairsFromList(list){",
    )
    dst = dst.replace(
        "    function adminC4kRegistersKpiEngagementPairsFromList(list){",
        block + "    function adminC4kRegistersKpiEngagementPairsFromList(list){",
        1,
    )

    for old, new in [
        (
            "      var independence = adminSfStr(r.independence);\n      var instructor = adminSfStr(r.instructor) || adminSfStr(r.completedBy) || '—';",
            "      var independence =\n        adminSfStr(r.independence) || adminSfStr(r.engagementPatterns) || adminSfStr(r.engagement_patterns);\n      var instructor = adminSfStr(r.instructor) || adminSfStr(r.completedBy) || '—';\n      var submittedAt = adminSfStr(r.submittedAt) || adminSfStr(r.createdAt) || adminSfStr(r.created_at);",
        ),
        (
            "        sessionTimeSlot: adminSfStr(r.sessionTimeSlot || r.timeSlot || r.slotTime || r.sessionSlot || r.slot || '')\n      };",
            "        sessionTimeSlot: adminSfStr(r.sessionTimeSlot || r.timeSlot || r.slotTime || r.sessionSlot || r.slot || ''),\n        submittedAt: submittedAt || ''\n      };",
        ),
        (
            "    function adminC4kRegisterServiceCellHtml(d){\n      var line1 = esc(d.service || '—');\n      var slot = esc(adminC4kRegisterSessionSlotForServiceCell(d));",
            "    function adminC4kRegisterServiceCellHtml(d, opts){\n      opts = opts || {};\n      var line1 = esc(d.service || '—');\n      var line2;\n      if(opts.feedbackDateLine){\n        var iso10 = adminC4kRegisterRowIso10(d) || String(d.sortIso || '').trim().substring(0, 10);\n        line2 = esc(iso10.length >= 10 ? bookingFormatDdMmYy(iso10) : '—');\n      }else{\n        line2 = esc(adminC4kRegisterSessionSlotForServiceCell(d));\n      }",
        ),
        (
            "'<div class=\"muted\" style=\"font-size:11px;margin-top:3px;line-height:1.35;overflow-wrap:break-word\">' + slot + '</div>'",
            "'<div class=\"muted\" style=\"font-size:11px;margin-top:3px;line-height:1.35;overflow-wrap:break-word\">' + line2 + '</div>'",
        ),
    ]:
        if old not in dst:
            raise SystemExit(f"Missing in embed: {old[:60]}...")
        dst = dst.replace(old, new, 1)

    # Row html — read from src between markers
    old_row_start = "    function adminC4kDailyRegisterRowHtml(d){\n      var engCell = typeof d.eng === 'number'"
    if old_row_start in dst:
        row_block = extract_block(
            src,
            "    function adminC4kDailyRegisterRowHtml(d){",
            "    function adminC4kRegistersKpiEngagementPairsFromList(list){",
        )
        dst = dst.replace(
            extract_block(
                dst,
                "    function adminC4kDailyRegisterRowHtml(d){",
                "    function adminC4kRegistersKpiEngagementPairsFromList(list){",
            ),
            row_block,
            1,
        )

    panel_old = (
        "'<div class=\"card\" id=\"c4kSfMainGridCard\"><div class=\"card-pad c4k-sf-main-tbl-wrap\" "
        "style=\"overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%\">"
        "<table class=\"tbl tbl--center c4k-sf-main-tbl\"><thead><tr><th>Participant</th>"
        "<th scope=\"col\" class=\"c4k-sf-col-svc\">Service</th><th scope=\"col\" class=\"c4k-sf-th-eng\">' "
        "+ adminC4kEmotionHeaderLegendHtml() + '</th><th scope=\"col\" class=\"c4k-sf-col-indep\">Independence</th>"
    )
    panel_new = (
        "'<div class=\"card\" id=\"c4kSfMainGridCard\"><div class=\"card-pad c4k-sf-main-tbl-wrap\" "
        "style=\"overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%\">"
        "<table class=\"tbl tbl--center c4k-sf-main-tbl\">' + adminC4kSessionFeedbackMainTableHeadHtml() + "
        "'<tbody id=\"c4kSfFeedbackTbody\">"
    )
    if panel_old in dst:
        dst = dst.replace(
            "'<div class=\"card\" id=\"c4kSfMainGridCard\"><div class=\"card-pad c4k-sf-main-tbl-wrap\" style=\"overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%\"><table class=\"tbl tbl--center c4k-sf-main-tbl\"><thead><tr><th>Participant</th><th scope=\"col\" class=\"c4k-sf-col-svc\">Service</th><th scope=\"col\" class=\"c4k-sf-th-eng\">' + adminC4kEmotionHeaderLegendHtml() + '</th><th scope="col" class="c4k-sf-col-indep">Independence</th><th scope="col" class="c4k-sf-col-pos">Positive</th><th scope="col" class="c4k-sf-col-rel">Relevant</th><th scope="col" class="c4k-sf-col-inst">Instructor</th></tr></thead><tbody id="c4kSfFeedbackTbody"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div></div>' +",
            "'<div class=\"card\" id=\"c4kSfMainGridCard\"><div class=\"card-pad c4k-sf-main-tbl-wrap\" style=\"overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%\"><table class=\"tbl tbl--center c4k-sf-main-tbl\">' + adminC4kSessionFeedbackMainTableHeadHtml() + '<tbody id=\"c4kSfFeedbackTbody\"><tr><td colspan=\"8\" class=\"muted\">Loading…</td></tr></tbody></table></div></div>' +",
            1,
        )

    registers_old = (
        '<table class="tbl tbl--center c4k-sf-main-tbl"><thead><tr><th>Participant</th>'
        '<th scope="col" class="c4k-sf-col-svc" title="Service (first line) and session time slot (second line)">Service</th>'
    )
    if registers_old in dst:
        dst = dst.replace(
            '<div class="card"><div class="card-pad c4k-sf-main-tbl-wrap" style="overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%"><table class="tbl tbl--center c4k-sf-main-tbl"><thead><tr><th>Participant</th><th scope="col" class="c4k-sf-col-svc" title="Service (first line) and session time slot (second line)">Service</th><th scope="col" class="c4k-sf-th-eng" title="Engagement (1–5)"><span class="c4k-sf-th-eng__ico" role="img" aria-label="Engagement score, 1 to 5"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></span></th>'+
            '<th scope="col" class="c4k-sf-col-emo" title="Emotions / regulation: green happy/excited, yellow anxious, blue withdrawn, red out of control" aria-label="Emotions and regulation (icons: green happy or excited, yellow anxious, blue withdrawn, red out of control)">' + adminC4kEmotionHeaderLegendHtml() + '</th>'+
            '<th scope="col" class="c4k-sf-col-indep">Independence</th><th scope="col" class="c4k-sf-col-pos" title="Click the cell when there is text to open review and notify">Positive <span class="muted" style="font-weight:600">(opt.)</span></th><th scope="col" class="c4k-sf-col-rel" title="Click the cell when there is text to open review actions">Relevant <span class="muted" style="font-weight:600">(opt.)</span></th><th scope="col" class="c4k-sf-col-inst" title="Instructor (sheet) and session date">Instructor</th></tr></thead><tbody id="c4kSfFeedbackTbody"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div>'+foot+'</div>'+
            '<div class="card"><div class="card-pad c4k-sf-main-tbl-wrap" style="overflow-x:hidden;overflow-y:auto;padding:0;min-width:0;max-width:100%"><table class="tbl tbl--center c4k-sf-main-tbl">' + adminC4kSessionFeedbackMainTableHeadHtml() + '<tbody id="c4kSfFeedbackTbody"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div>'+foot+'</div>'+
            1,
        )

    DST.write_text(dst, encoding="utf-8")
    print("Synced", DST)


if __name__ == "__main__":
    main()
