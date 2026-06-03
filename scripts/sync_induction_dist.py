#!/usr/bin/env python3
"""Copy built General Induction (dist/) into working_ui for Vercel static hosting."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
INDUCTION_SRC = REPO_ROOT / ".tmp_induction_repo"
WORKING_UI = REPO_ROOT / "working_ui"
TARGETS = (
    ("assets", WORKING_UI / "induction-assets"),
    ("shared", WORKING_UI / "induction-shared"),
    ("general-induction", WORKING_UI / "general-induction"),
    ("index.html", WORKING_UI / "general-induction-root.html"),
    ("404.html", WORKING_UI / "induction-404.html"),
)


def build_induction(src: Path) -> None:
    build_py = src / "build_provisional.py"
    if not build_py.is_file():
        raise SystemExit(f"Missing {build_py}")
    subprocess.run([sys.executable, str(build_py)], check=True, cwd=str(src))


def rewrite_html_paths(content: str) -> str:
    """Induction dist uses /assets and /shared; host under /induction-assets and /induction-shared."""
    return (
        content.replace('href="/assets/', 'href="/induction-assets/')
        .replace("href='/assets/", "href='/induction-assets/")
        .replace('src="/assets/', 'src="/induction-assets/')
        .replace("src='/assets/", "src='/induction-assets/")
        .replace('href="/shared/', 'href="/induction-shared/')
        .replace("href='/shared/", "href='/induction-shared/")
        .replace('src="/shared/', 'src="/induction-shared/')
        .replace("src='/shared/", "src='/induction-shared/")
    )


def copy_tree(src_dir: Path, dest_dir: Path, *, html_only_rewrite: bool = False) -> None:
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    for path in src_dir.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(src_dir)
        out = dest_dir / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if html_only_rewrite and path.suffix.lower() in {".html", ".js"}:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                shutil.copy2(path, out)
                continue
            out.write_text(rewrite_html_paths(text), encoding="utf-8")
        else:
            shutil.copy2(path, out)


def patch_file(path: Path) -> None:
    if not path.is_file():
        return
    text = path.read_text(encoding="utf-8")
    patched = rewrite_html_paths(text)
    if patched != text:
        path.write_text(patched, encoding="utf-8")


def main() -> None:
    src = INDUCTION_SRC
    if not (src / "dist").is_dir():
        if not src.is_dir():
            raise SystemExit(
                "Clone clubsensational-induction-provisional to .tmp_induction_repo first, "
                "or set INDUCTION_SRC."
            )
        build_induction(src)

    dist = src / "dist"
    if not dist.is_dir():
        raise SystemExit("dist/ not found after build")

    copy_tree(dist / "assets", WORKING_UI / "induction-assets")
    copy_tree(dist / "shared", WORKING_UI / "induction-shared", html_only_rewrite=True)
    copy_tree(dist / "general-induction", WORKING_UI / "general-induction", html_only_rewrite=True)

  # Root redirect page
    root_redirect = dist / "index.html"
    if root_redirect.is_file():
        (WORKING_UI / "general-induction-root.html").write_text(
            rewrite_html_paths(root_redirect.read_text(encoding="utf-8")),
            encoding="utf-8",
        )

    # Patch certificate logo path (source file is always UTF-8)
    src_cert = src / "common" / "shared" / "provisional-certificate.js"
    cert_js = WORKING_UI / "induction-shared" / "provisional-certificate.js"
    if src_cert.is_file() and cert_js.is_file():
        text = src_cert.read_text(encoding="utf-8", errors="replace")
        text = text.replace(
            "var LOGO_URL = '/assets/clubsensational-portal-logo.png';",
            "var LOGO_URL = '/induction-assets/clubsensational-portal-logo.png';",
        )
        text = rewrite_html_paths(text)
        cert_js.write_text(text, encoding="utf-8")

    portal_view = WORKING_UI / "induction-shared" / "portal-induction-complete-view.js"
    src_view = REPO_ROOT / "working_ui" / "induction-shared" / "portal-induction-complete-view.js"
    if src_view.is_file() and not portal_view.is_file():
        shutil.copy2(src_view, portal_view)

    print(f"Synced induction dist from {dist} -> {WORKING_UI}")


if __name__ == "__main__":
    main()
