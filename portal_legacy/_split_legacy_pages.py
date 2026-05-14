# -*- coding: utf-8 -*-
"""One-off: copy legacy HTML into portal/* and split style / scripts."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORTAL = ROOT / "portal"

SCRIPT_OPEN = re.compile(r"<script(\s[^>]*)?>", re.I)
SCRIPT_CLOSE = re.compile(r"</script>", re.I)


def extract_styles(html: str) -> tuple[str, str]:
    styles = re.findall(r"<style[^>]*>([\s\S]*?)</style>", html, flags=re.I)
    css = "\n\n".join(s.strip() for s in styles)
    html_wo = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html, flags=re.I, count=len(styles))
    return html_wo, css


def extract_inline_scripts(html: str) -> tuple[list[tuple[str | None, str]], str]:
    """Return list of (attrs_or_None, body), and html with those script blocks removed."""
    out: list[tuple[str | None, str]] = []
    pos = 0
    pieces: list[str] = []

    for m in SCRIPT_OPEN.finditer(html):
        attrs = m.group(1)
        if attrs and "src=" in attrs.lower():
            pieces.append(html[pos : m.start()])
            pos = m.start()
            close = html.lower().find("</script>", m.end())
            if close == -1:
                raise ValueError("unclosed script with src")
            close += len("</script>")
            pieces.append(html[pos:close])
            pos = close
            continue

        pieces.append(html[pos : m.start()])
        close = html.lower().find("</script>", m.end())
        if close == -1:
            raise ValueError("unclosed inline script")
        body = html[m.end() : close].strip("\n")
        out.append((attrs, body))
        pos = close + len("</script>")

    pieces.append(html[pos:])
    return out, "".join(pieces)


def inject_head(html: str, css_name: str, *, head_blocking_js: str | None = None) -> str:
    link = f'  <link rel="stylesheet" href="{css_name}" />\n'
    js_head = ""
    if head_blocking_js:
        js_head = f'  <script src="{head_blocking_js}"></script>\n'
    if "</head>" not in html.lower():
        raise ValueError("no </head>")
    idx = html.lower().find("</head>")
    return html[:idx] + js_head + link + html[idx:]


def inject_tail_js(html: str, js_name: str) -> str:
    tag = f'  <script src="{js_name}"></script>\n'
    low = html.lower()
    if "</body>" in low:
        i = low.rfind("</body>")
        return html[:i] + tag + html[i:]
    if "</html>" in low:
        i = low.rfind("</html>")
        return html[:i] + tag + html[i:]
    return html + "\n" + tag


def replace_paths(html: str, rules: list[tuple[str, str]]) -> str:
    for a, b in rules:
        html = html.replace(a, b)
    return html


def write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    # --- login ---
    login_src = ROOT / "Login" / "login.html"
    html = login_src.read_text(encoding="utf-8")
    html, css = extract_styles(html)
    scripts, html = extract_inline_scripts(html)
    assert len(scripts) == 1, len(scripts)
    js = scripts[0][1]
    html = inject_head(html, "login_styles.css")
    html = inject_tail_js(html, "login_scripts.js")
    html = replace_paths(
        html,
        [
            ('admin: "../Dashboards/Dashboard/admin_dashboard.html"', 'admin: "../admin_dashboard/admin_dashboard.html"'),
            ('staff: "../Dashboards/Dashboard/staff_dashboard.html"', 'staff: "../staff_dashboard/staff_dashboard.html"'),
            ('lead: "../Dashboards/Dashboard/lead_dashboard.html"', 'lead: "../lead_dashboard/lead_dashboard.html"'),
        ],
    )
    write(PORTAL / "login" / "login.html", html)
    write(PORTAL / "login" / "login_styles.css", css)
    write(PORTAL / "login" / "login_scripts.js", js)

    # --- admin dashboard ---
    admin_src = ROOT / "Dashboards" / "Dashboard" / "admin_dashboard.html"
    html = admin_src.read_text(encoding="utf-8")
    html, css = extract_styles(html)
    scripts, html = extract_inline_scripts(html)
    assert len(scripts) == 2, len(scripts)
    keep0 = f"<script{scripts[0][0] or ''}>\n{scripts[0][1]}\n  </script>"
    js = scripts[1][1]
    html = inject_head(html, "admin_dashboard_styles.css")
    html = inject_tail_js(html, "admin_dashboard_scripts.js")
    low = html.lower()
    ins = low.find("<body>")
    if ins == -1:
        raise ValueError("admin: no body")
    body_tag_end = ins + len("<body>")
    html = html[:body_tag_end] + "\n" + keep0 + html[body_tag_end:]
    write(PORTAL / "admin_dashboard" / "admin_dashboard.html", html)
    write(PORTAL / "admin_dashboard" / "admin_dashboard_styles.css", css)
    write(PORTAL / "admin_dashboard" / "admin_dashboard_scripts.js", js)

    # --- staff & lead: keep first two inline scripts, bundle third ---
    for name in ("staff_dashboard", "lead_dashboard"):
        src = ROOT / "Dashboards" / "Dashboard" / f"{name}.html"
        html = src.read_text(encoding="utf-8")
        html, css = extract_styles(html)
        scripts, html = extract_inline_scripts(html)
        assert len(scripts) == 3, (name, len(scripts))
        keep01 = (
            f"<script{scripts[0][0] or ''}>\n{scripts[0][1]}\n  </script>\n"
            f"<script{scripts[1][0] or ''}>\n{scripts[1][1]}\n  </script>"
        )
        js = scripts[2][1]
        html = inject_head(html, f"{name}_styles.css")
        html = inject_tail_js(html, f"{name}_scripts.js")
        low = html.lower()
        ins = low.find("<body>")
        if ins == -1:
            raise ValueError(f"{name}: no body")
        body_tag_end = ins + len("<body>")
        html = html[:body_tag_end] + "\n" + keep01 + html[body_tag_end:]
        write(PORTAL / name / f"{name}.html", html)
        write(PORTAL / name / f"{name}_styles.css", css)
        write(PORTAL / name / f"{name}_scripts.js", js)

    # --- announcements ---
    ann_src = ROOT / "Announcements" / "announcements.html"
    html = ann_src.read_text(encoding="utf-8")
    html, css = extract_styles(html)
    scripts, html = extract_inline_scripts(html)
    assert len(scripts) == 1, len(scripts)
    js = scripts[0][1]
    html = inject_head(html, "announcements_styles.css", head_blocking_js="announcements_scripts.js")
    html = replace_paths(
        html,
        [
            ('href="../Dashboards/Dashboard/staff_dashboard.html"', 'href="../staff_dashboard/staff_dashboard.html"'),
        ],
    )
    write(PORTAL / "announcements" / "announcements.html", html)
    write(PORTAL / "announcements" / "announcements_styles.css", css)
    write(PORTAL / "announcements" / "announcements_scripts.js", js)

    # --- training (from setup_role_training) ---
    train_src = ROOT / "Dashboards" / "Setup" / "setup_role_training.html"
    html = train_src.read_text(encoding="utf-8")
    html, css = extract_styles(html)
    scripts, html = extract_inline_scripts(html)
    assert len(scripts) == 1, len(scripts)
    js = scripts[0][1]
    html = re.sub(
        r"<title>[^<]*</title>",
        "<title>Training modules · clubSENsational</title>",
        html,
        count=1,
        flags=re.I,
    )
    html = inject_head(html, "training_styles.css", head_blocking_js="training_scripts.js")
    html = replace_paths(
        html,
        [
            ('href="../Dashboard/staff_dashboard.html"', 'href="../staff_dashboard/staff_dashboard.html"'),
        ],
    )
    write(PORTAL / "training" / "training_modules.html", html)
    write(PORTAL / "training" / "training_styles.css", css)
    write(PORTAL / "training" / "training_scripts.js", js)

    print("OK: portal pages synced from legacy HTML.")


if __name__ == "__main__":
    main()
