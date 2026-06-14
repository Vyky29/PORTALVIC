#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate PORTALVIC sources-of-truth PDF (English) for admin briefing."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parent / "SOURCES_OF_TRUTH_PORTAL.pdf"


class GuidePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(
            0,
            8,
            f"PORTALVIC - Sources of truth - {date.today().isoformat()} - p.{self.page_no()}",
            align="C",
        )


def ascii_safe(text: str) -> str:
    replacements = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2192": "->",
        "\u00b7": "-",
        "\u2026": "...",
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


def section(pdf: GuidePDF, title: str) -> None:
    title = ascii_safe(title)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(15, 23, 42)
    pdf.multi_cell(pdf.epw, 7, title)
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 41, 59)


def bullet(pdf: GuidePDF, text: str) -> None:
    text = ascii_safe(text)
    pdf.set_x(pdf.l_margin + 2)
    pdf.multi_cell(pdf.epw - 2, 5.5, "- " + text)


def label_line(pdf: GuidePDF, label: str, text: str) -> None:
    label = ascii_safe(label)
    text = ascii_safe(text)
    pdf.set_font("Helvetica", "B", 10)
    pdf.write(5.5, label + " ")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(pdf.epw, 5.5, text)


def body(pdf: GuidePDF, text: str) -> None:
    pdf.multi_cell(pdf.epw, 5.5, ascii_safe(text))


def build() -> None:
    pdf = GuidePDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 18, 18)
    w = pdf.epw
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(15, 23, 42)
    pdf.multi_cell(w, 10, ascii_safe("PORTALVIC"))
    pdf.set_font("Helvetica", "B", 14)
    pdf.multi_cell(w, 8, ascii_safe("Sources of truth - Admin guide"))
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(51, 65, 85)
    body(
        pdf,
        "Who changes what in the portal, where it is stored, and how admin screens stay in sync "
        "with staff dashboards. Admin can make many term changes directly in the app (no terminal). "
        "Victor maintains the long-term foundation in the repo and deploy pipeline.",
    )
    pdf.ln(2)
    pdf.set_fill_color(239, 246, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(
        w,
        6,
        ascii_safe(
            "Golden rule: one logical source per data type. Base roster lives in the repo; "
            "live admin edits layer on top via Supabase and must appear the same in Admin and Staff."
        ),
        fill=True,
    )

    section(pdf, "1. Three layers (how sync works)")
    body(
        pdf,
        "Staff and Lead dashboards merge three sources. Admin tools usually touch layers 2 or 3; "
        "layer 1 is the deployed term baseline.",
    )
    bullet(
        pdf,
        "Layer 1 - Term bundle (repo + deploy): staff_dashboard_spreadsheet_bundle.js from MADRE JSON. "
        "Victor updates via sync script + git push.",
    )
    bullet(
        pdf,
        "Layer 2 - Live term roster (Supabase): portal_roster_rows from New participant and Edit term slot. "
        "Immediate for Admin and Staff (no redeploy).",
    )
    bullet(
        pdf,
        "Layer 3 - One-day overrides (Supabase): schedule_overrides from Schedule & Covers. "
        "Single calendar day only.",
    )
    pdf.ln(1)
    body(
        pdf,
        "Visual guide for admins: working_ui/admin_roster_guide.html (deployed on Vercel). "
        "If Admin and Staff disagree, check layer 2/3 first; if the whole term baseline is wrong, Victor fixes layer 1.",
    )

    section(pdf, "2. Layer 1 - Term foundation (Victor / machine)")
    label_line(
        pdf,
        "A. Participant roster (MADRE JSON):",
        "Default sessions: participant, date, time, service, venue, pool/area, instructor. "
        "File: working_ui/portal/roster_term_master.json. Visual editor: roster_term_master_review.html.",
    )
    label_line(
        pdf,
        "B. Staff pool hours template:",
        "Default who works which venue/time bands (not participant slots). "
        "Seeded in spreadsheet reference data; staff-shifts.csv in repo for bulk edits.",
    )
    label_line(pdf, "Who edits:", "Victor (terminal + git push). Admin does not edit JSON files.")
    label_line(
        pdf,
        "Where it affects:",
        "Staff dashboard, Lead dashboard, Admin Base schedule, session feedback, week counters - "
        "after deploy (typically 5-10 min via Vercel).",
    )
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    body(pdf, "Victor terminal steps when the baseline term changes:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Edit roster_term_master.json (or export from the review grid).")
    bullet(pdf, "Run: python database/roster_review/sync_roster_madre_to_portal.py")
    bullet(pdf, "git commit + git push origin main (Vercel redeploys working_ui/).")
    bullet(pdf, "Spot-check Admin Base schedule + one affected staff login on the same date.")

    section(pdf, "3. Layer 2 - Admin screens that save live (synced)")
    body(
        pdf,
        "These screens write to Supabase. Changes should appear in Admin and Staff without Victor "
        "running terminal commands.",
    )

    pdf.set_font("Helvetica", "B", 11)
    body(pdf, "3a. Spreadsheet reference - Staff hours tab")
    pdf.set_font("Helvetica", "", 10)
    label_line(pdf, "Menu:", "Admin -> Spreadsheet reference -> Staff hours.")
    label_line(
        pdf,
        "What:",
        "Edit staff assignment cells (name + time band per venue/date). Click Save staff hours.",
    )
    label_line(pdf, "Stored in:", "Supabase table portal_staff_timetable_cells.")
    label_line(
        pdf,
        "Scope:",
        "Staff pool hours from 2026-06-01 onward. Does NOT replace participant session rows (Fuente A).",
    )
    bullet(pdf, "Admin: edit cells, Save, confirm staff dashboard shows new hours.")
    bullet(pdf, "Victor: only if save fails (RLS/auth) or template seed needs a term-wide reset in repo.")

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    body(pdf, "3b. Edit term slot")
    pdf.set_font("Helvetica", "", 10)
    label_line(pdf, "Menu:", "Admin -> Edit term slot (or link from Schedule & Covers).")
    label_line(
        pdf,
        "What:",
        "Change a participant slot: time, instructor, venue, pool/area; cancel service; mark no participant.",
    )
    label_line(pdf, "Stored in:", "Supabase table portal_roster_rows (+ portal_roster_row_events audit).")
    label_line(
        pdf,
        "Apply to (scope):",
        "This day only | Every [weekday] until end of term | Rest of term from anchor | Selected sessions.",
    )
    bullet(
        pdf,
        "Every Sunday until end of term = term-wide change for that weekday pattern (live overlay, not JSON).",
    )
    bullet(pdf, "Reload from roster = refill form from the deployed bundle (Layer 1 baseline).")
    bullet(pdf, "Admin: pick participant + service, set scope, Save term slot, verify on staff device.")
    bullet(
        pdf,
        "Victor: periodically merge permanent term-wide edits back into roster_term_master.json so "
        "Layer 1 and Layer 2 do not drift forever.",
    )

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    body(pdf, "3d. New participant")
    pdf.set_font("Helvetica", "", 10)
    label_line(pdf, "Menu:", "Admin -> Sessions hub -> New participant (open / Available cell).")
    label_line(
        pdf,
        "What:",
        "Place a new family on an open roster cell (trial or new booking).",
    )
    label_line(pdf, "Stored in:", "Supabase portal_roster_rows (+ portal_roster_row_events audit).")
    bullet(pdf, "Admin: pick date + open slot, save; staff see after portal refresh.")
    bullet(pdf, "Do not use Schedule & Covers for a brand-new placement on Available.")

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    body(pdf, "3e. Schedule & Covers (day overrides)")
    pdf.set_font("Helvetica", "", 10)
    label_line(pdf, "Menu:", "Admin -> Sessions - Schedule & Covers - Base schedule row actions.")
    label_line(
        pdf,
        "What:",
        "One-off covers, moves, cancellations for a specific calendar day.",
    )
    label_line(pdf, "Stored in:", "Supabase schedule_overrides (+ related roster row events).")
    bullet(pdf, "Admin: use for a single date exception (e.g. Luliya covers Giuseppe on one Sunday).")
    bullet(pdf, "Victor: only if override visible in Admin but missing on Staff (sync bug).")

    section(pdf, "4. Spreadsheet reference - Group sessions tab (read-only)")
    body(
        pdf,
        "The Group sessions grid mirrors the roster week for reference. It is intentionally read-only here.",
    )
    bullet(pdf, "Do NOT expect edits in this tab to save.")
    bullet(pdf, "To change participant slots: use Edit term slot or Schedule & Covers.")
    bullet(pdf, "To change staff hours: use the Staff hours tab.")

    section(pdf, "5. Feedback merge rules (automatic)")
    body(
        pdf,
        "When Aquatic + Multi-Activity run back-to-back with the SAME instructor (e.g. Yusuf/Roberto Sunday, "
        "Cyrus/Javier Wednesday):",
    )
    bullet(pdf, "Staff day card: one block (e.g. 9:00-10:15) and ONE feedback form.")
    bullet(pdf, "This week counters: Aquatic and Multi-Activity still counted separately.")
    bullet(pdf, "Generated when Victor syncs Layer 1; Admin does not edit merge rules by hand.")

    section(pdf, "6. Other data sources (quick reference)")
    label_line(
        pdf,
        "Participant long profiles:",
        "database/clients_info_machine.csv -> clients_info_embed.js (Victor deploys).",
    )
    label_line(
        pdf,
        "Payments / finance grid:",
        "Clients Payments spreadsheet -> clients_payments_portal_data.js (Admin views; Victor exports).",
    )
    label_line(
        pdf,
        "Achievement photos:",
        "Admin -> Participant achievements (inbox assign, rotate, delete, bulk select). Supabase Storage.",
    )

    section(pdf, "7. What NOT to use as source of truth")
    bullet(pdf, "Editing Group sessions in Spreadsheet reference (read-only tab).")
    bullet(pdf, "Duplicate roster copies (old bundle + new JSON + undated templates at once).")
    bullet(pdf, "Submitted session feedback (historical record, not roster).")
    bullet(pdf, "Random Supabase row edits outside Edit term slot / Schedule & Covers / Staff hours save.")

    section(pdf, "8. Who does what - summary table")
    pdf.set_font("Helvetica", "B", 9)
    col_w = [44, 50, 50, 46]
    headers = ["Change type", "Admin (app)", "Victor (machine)", "Live when"]
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, ascii_safe(h), border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8.5)
    rows = [
        (
            "Staff pool hours",
            "Spreadsheet ref. Staff hours + Save",
            "Re-seed template if term reset",
            "Immediate (Supabase)",
        ),
        (
            "Participant slot (one day)",
            "Edit term slot OR Schedule & Covers",
            "Only if sync broken",
            "Immediate (Supabase)",
        ),
        (
            "Participant slot (whole weekday in term)",
            "Edit term slot - Every [weekday]...",
            "Fold into JSON MADRE later",
            "Immediate (Supabase)",
        ),
        (
            "Whole term baseline",
            "Request documented change",
            "JSON MADRE + sync script + push",
            "After Vercel deploy",
        ),
        (
            "Pool/area note only",
            "Edit term slot or request",
            "CSV or MADRE sync + push",
            "Supabase or deploy",
        ),
        (
            "Achievement inbox photos",
            "Participant achievements",
            "Supabase migration if permissions",
            "Immediate",
        ),
    ]
    for row in rows:
        for i, cell in enumerate(row):
            pdf.cell(col_w[i], 14, ascii_safe(cell), border=1)
        pdf.ln()

    section(pdf, "9. Admin checklist before saving a term change")
    bullet(pdf, "One day only or whole weekday pattern? -> pick the right Apply to scope.")
    bullet(pdf, "Participant, date anchor, time, service, pool/area, instructor all correct?")
    bullet(pdf, "After Save: open Staff dashboard for that instructor on the same date.")
    bullet(pdf, "If term-wide and permanent: tell Victor to fold into roster_term_master.json.")

    section(pdf, "10. Victor commands (reference)")
    pdf.set_font("Courier", "", 9)
    pdf.set_fill_color(248, 250, 252)
    cmds = [
        "# Sync participant roster foundation (Layer 1)",
        "python database/roster_review/sync_roster_madre_to_portal.py",
        "",
        "# Area notes from CSV (alternative)",
        "python database/roster_review/apply_participants_by_day_csv.py",
        "",
        "# Regenerate this PDF",
        "python database/roster_review/generate_fuentes_verdad_pdf.py",
        "",
        "# Deploy foundation changes",
        "git add -A && git commit -m 'Roster: ...' && git push origin main",
    ]
    for line in cmds:
        pdf.multi_cell(pdf.epw, 5, ascii_safe(line), fill=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 116, 139)
    body(
        pdf,
        "Technical: Victor - GitHub PORTALVIC - Supabase Portal (cklpnwhlqsulpmkipmqb) - "
        "Deploy: Vercel working_ui/",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
