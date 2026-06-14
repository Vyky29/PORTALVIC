#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate PORTALVIC sources-of-truth PDF for admin briefing."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "FUENTES_DE_VERDAD_PORTAL.pdf"


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


class GuidePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"PORTALVIC - Fuentes de verdad - {date.today().isoformat()} - p.{self.page_no()}", align="C")


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
    pdf.multi_cell(w, 8, ascii_safe("Fuentes de verdad de la app"))
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(51, 65, 85)
    pdf.multi_cell(
        w,
        6,
        "Documento para el equipo Admin. Explica qué datos mandan en el portal, "
        "quién puede cambiarlos desde la app y qué debe hacer Victor en la máquina "
        "(terminal + despliegue) para que staff y admin vean lo mismo.",
    )
    pdf.ln(2)
    pdf.set_fill_color(239, 246, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(
        w,
        6,
        "Regla de oro: un solo origen por tipo de dato. Si se edita en dos sitios distintos, "
        "admin y staff pueden desincronizarse.",
        fill=True,
    )

    section(pdf, "1. Resumen - cuántas fuentes hay")
    pdf.multi_cell(
        pdf.epw,
        5.5,
        "Para turnos y horarios del término hay TRES capas. Solo las dos primeras son "
        "'plantilla' editable fuera de la app. La tercera son excepciones puntuales "
        "desde Admin en producción:",
    )
    bullet(pdf, "Fuente A - Roster MADRE (JSON): sesiones de participantes - quién, cuándo, servicio, área/pool, instructor.")
    bullet(pdf, "Fuente B - Horas de staff en rota (spreadsheet): cuándo trabaja cada miembro del equipo en días de rota.")
    bullet(pdf, "Fuente C - Overrides en Supabase: cambios puntuales del día (cubrir, mover, cancelar) hechos desde Admin.")
    pdf.ln(2)
    pdf.multi_cell(
        pdf.epw,
        5.5,
        "Otros datos importantes (no son el roster del término, pero sí fuentes propias):",
    )
    bullet(pdf, "Fichas largas de participante (médico, motivadores) - CSV clients_info.")
    bullet(pdf, "Pagos / facturación - hoja Clients Payments (grid finance en Admin).")
    bullet(pdf, "Fotos de logros - Storage Supabase + pantalla Participant achievements en Admin.")

    section(pdf, "2. Fuente A - Roster MADRE (participantes)")
    label_line(pdf, "Qué es:", "La verdad de las sesiones de clientes: día, hora, servicio, venue, área (Big Pool, Hub Room...), instructor asignado.")
    label_line(pdf, "Archivo maestro:", "working_ui/portal/roster_term_master.json")
    label_line(pdf, "Editor visual:", "working_ui/roster_term_master_review.html (grid por día, 30 min, exportar JSON).")
    label_line(pdf, "Quién edita contenido:", "Victor (o quien mantenga el JSON). Admin NO edita este archivo en la máquina.")
    label_line(pdf, "Dónde afecta:", "Staff dashboard (mi día / this week), Lead dashboard, Admin Schedule & Covers (Base schedule), feedback de sesión, contadores semanales.")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Admin cuando hay cambios de participante:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Pedir el cambio por el canal acordado (WhatsApp, email, reunión) con: participante, día/fecha, hora, servicio, área, instructor.")
    bullet(pdf, "NO intentar corregir el roster editando filas sueltas en Supabase salvo urgencia puntual acordada con Victor.")
    bullet(pdf, "Para un domingo concreto (ej. cubrir a Giuseppe por Luliya): usar Fuente C (override en Admin) si es solo ese día; si es regla del término entero, pedir cambio en Fuente A.")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Victor en la máquina (terminal):")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Recibir el JSON exportado o editar roster_term_master.json / grid review.")
    bullet(pdf, "Desde la raíz del repo: python database/roster_review/sync_roster_madre_to_portal.py")
    bullet(pdf, "Eso regenera bundle, merges de feedback (ej. Yusuf 9–10:15 un feedback) y filas del dashboard.")
    bullet(pdf, "git commit + git push -> Vercel redeploya (5–10 min). Comprobar staff + admin el mismo día.")

    section(pdf, "3. Reglas especiales de feedback (automáticas)")
    pdf.multi_cell(
        pdf.epw,
        5.5,
        "Cuando un participante tiene Aquatic + Multi-Activity seguidos con el MISMO instructor "
        "(ej. Yusuf domingo con Roberto, Cyrus miércoles con Javier):",
    )
    bullet(pdf, "En la card del día del staff: UN bloque (ej. 9:00–10:15) y UN solo feedback.")
    bullet(pdf, "En 'This week': siguen contándose Aquatic y Multi-Activity por separado (estadística real).")
    bullet(pdf, "Estas reglas se generan al sincronizar Fuente A; Admin no las edita a mano.")

    section(pdf, "4. Fuente B - Horas de staff (días de rota)")
    label_line(pdf, "Qué es:", "Plantilla de cuándo trabaja cada miembro del equipo (turnos de staff, no sesiones de clientes).")
    label_line(pdf, "Archivos:", "database/roster_review/staff-shifts.csv - editor Admin: Spreadsheet reference / horas en admin.")
    label_line(pdf, "Quién edita:", "Admin puede proponer cambios; Victor aplica en repo y despliega.")
    label_line(pdf, "Dónde afecta:", "Vista de horas de staff, planificación de cobertura; NO sustituye las sesiones de clientes (Fuente A).")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Admin:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Indicar qué staff, qué días y franjas horarias cambian en la rota.")
    bullet(pdf, "Usar Admin -> referencia spreadsheet / edición de horas si está habilitada (cambios van a Supabase o export).")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Victor:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Actualizar staff-shifts.csv o bundle según el proceso acordado.")
    bullet(pdf, "Commit + push -> Vercel.")

    section(pdf, "5. Fuente C - Overrides (Admin en la app, Supabase)")
    label_line(pdf, "Qué es:", "Excepciones puntuales: cubrir a alguien, mover sesión, cancelación, cambio de área solo ese día.")
    label_line(pdf, "Dónde se editan:", "Admin -> Sessions - Schedule & Covers - Base schedule (clic en fila) - Edit term slot - Overrides.")
    label_line(pdf, "Tablas Supabase:", "schedule_overrides - portal_roster_rows - portal_roster_row_events")
    label_line(pdf, "Quién edita:", "Admin / CEO con login en admin_dashboard.html (RLS).")
    label_line(pdf, "Dónde afecta:", "Admin Y staff en tiempo real (Realtime Supabase) - deben verse igual.")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Admin:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Crear o revisar override el mismo día del cambio.")
    bullet(pdf, "Comprobar en staff dashboard del instructor afectado que ve el cambio.")
    bullet(pdf, "Si staff no ve el override: avisar a Victor (no duplicar el cambio en JSON).")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.multi_cell(pdf.epw, 5.5, "Qué hace Victor:")
    pdf.set_font("Helvetica", "", 10)
    bullet(pdf, "Solo si hay bug de sync: revisar merge en portal-roster-rows-merge.js o migración SQL.")
    bullet(pdf, "Si el cambio es permanente para todo el término: mover a Fuente A, no dejar override eterno.")

    section(pdf, "6. Otras fuentes (referencia rápida)")
    label_line(
        pdf,
        "Fichas participante:",
        "database/clients_info_machine.csv -> working_ui/portal/clients_info_embed.js. "
        "Cambios de texto médico/ficha: pedir a Victor; python database/export si aplica.",
    )
    label_line(
        pdf,
        "Pagos:",
        "Clients Payments (PORTAL).xlsx -> clients_payments_portal_data.js. "
        "Admin usa grid Finance en Admin; cambios de hoja vía Victor.",
    )
    label_line(
        pdf,
        "Fotos logros:",
        "Admin -> Participant achievements. Inbox: asignar a participante, girar, borrar, selección múltiple. "
        "Sin acceso a terminal.",
    )

    section(pdf, "7. Qué NO usar como fuente de verdad")
    bullet(pdf, "Varias copias del roster mezcladas (bundle viejo + JSON nuevo + plantillas sin fecha duplicadas).")
    bullet(pdf, "CSV participants-by-day solo para corregir áreas/notas puntuales - no sustituye al JSON MADRE para horarios completos.")
    bullet(pdf, "Feedback ya enviado - es histórico, no edita el roster.")
    bullet(pdf, "Datos demo / Teflon - excluidos de producción.")

    section(pdf, "8. Tabla - quién hace qué")
    pdf.set_font("Helvetica", "B", 9)
    col_w = [48, 52, 52, 38]
    headers = ["Tipo de cambio", "Admin (app)", "Victor (máquina)", "Tiempo live"]
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    rows = [
        ("Sesión participante (término)", "Pedir cambio documentado", "JSON MADRE + sync_roster_madre_to_portal.py + push", "Tras deploy Vercel"),
        ("Solo área/pool en nota", "Pedir o CSV review", "apply_participants CSV o sync MADRE + push", "Tras deploy"),
        ("Horas staff rota", "Pedir / spreadsheet admin", "staff-shifts + push", "Tras deploy"),
        ("Cover / cambio un día", "Override en Schedule & Covers", "Solo si falla sync", "Inmediato (Supabase)"),
        ("Ficha médica participante", "Pedir actualización", "clients_info CSV + export JS + push", "Tras deploy"),
        ("Fotos inbox", "Asignar / borrar / girar en Admin", "Migración Supabase si permisos", "Inmediato"),
    ]
    for row in rows:
        for i, cell in enumerate(row):
            pdf.cell(col_w[i], 12, cell, border=1)
        pdf.ln()

    section(pdf, "9. Checklist cuando Admin pide un cambio de roster")
    bullet(pdf, "¿Es para todo el término o solo un día? -> A (JSON) vs C (override).")
    bullet(pdf, "¿Cambia participante, hora, servicio, área o instructor? -> Anotar los cinco.")
    bullet(pdf, "¿Afecta reglas de feedback fusionado (Aquatic+Multi mismo instructor)? -> Decirlo explícitamente.")
    bullet(pdf, "Tras deploy: Admin comprueba Base schedule + un staff afectado el mismo día.")

    section(pdf, "10. Comandos Victor (copiar/pegar)")
    pdf.set_font("Courier", "", 9)
    pdf.set_fill_color(248, 250, 252)
    cmds = [
        "# Sincronizar roster participantes (Fuente A)",
        "python database/roster_review/sync_roster_madre_to_portal.py",
        "",
        "# Solo notas de área desde CSV (alternativa)",
        "python database/roster_review/apply_participants_by_day_csv.py",
        "",
        "# Desplegar",
        "git add -A && git commit -m 'Roster: ...' && git push origin main",
        "# Vercel redeploy automático desde GitHub",
    ]
    for line in cmds:
        pdf.multi_cell(pdf.epw, 5, line, fill=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 116, 139)
    pdf.multi_cell(
        pdf.epw,
        5,
        "Contacto técnico: Victor - Repo GitHub PORTALVIC - Supabase proyecto Portal (cklpnwhlqsulpmkipmqb) - "
        "Deploy: Vercel working_ui/",
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
