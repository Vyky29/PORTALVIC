#!/usr/bin/env python3
"""Remove solid backgrounds from pool area-note PNGs and normalise canvas size."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parents[1] / "working_ui" / "portal" / "area-note-icons"
USER_TEACHING = Path(
    "/Users/victor/.cursor/projects/Users-victor-cursor-PORTALVIC/assets/"
    "image-0634127b-bcf4-40d6-8278-83bd8dd39dbf.png"
)


def color_dist(a, b) -> int:
    return max(abs(int(a[i]) - int(b[i])) for i in range(3))


def sample_corner_bg(im: Image.Image, sample: int = 6) -> tuple[int, int, int]:
    w, h = im.size
    px = im.load()
    samples: list[tuple[int, int, int]] = []
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for cx, cy in corners:
        for dx in range(sample):
            for dy in range(sample):
                x = dx if cx == 0 else max(0, w - 1 - dx)
                y = dy if cy == 0 else max(0, h - 1 - dy)
                samples.append(px[x, y][:3])
    return tuple(sum(channel[i] for channel in samples) // len(samples) for i in range(3))


def remove_bg_flood(im: Image.Image, tolerance: int = 28) -> tuple[Image.Image, tuple[int, int, int]]:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = sample_corner_bg(im)
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def maybe_seed(x: int, y: int) -> None:
        if seen[y][x]:
            return
        if color_dist(px[x, y][:3], bg) <= tolerance:
            seen[y][x] = True
            q.append((x, y))

    for x in range(w):
        maybe_seed(x, 0)
        maybe_seed(x, h - 1)
    for y in range(h):
        maybe_seed(0, y)
        maybe_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx]:
                if color_dist(px[nx, ny][:3], bg) <= tolerance:
                    seen[ny][nx] = True
                    q.append((nx, ny))

    return im, bg


def trim(im: Image.Image, pad: int = 2) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit_canvas(im: Image.Image, target_w: int, target_h: int) -> Image.Image:
    im = trim(im)
    w, h = im.size
    scale = min(target_w / w, target_h / h)
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    im2 = im.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    out.paste(im2, ((target_w - nw) // 2, (target_h - nh) // 2))
    return out


def transparent_ratio(im: Image.Image) -> float:
    data = im.convert("RGBA").getdata()
    total = len(data)
    if not total:
        return 0.0
    transparent = sum(1 for p in data if p[3] < 128)
    return transparent / total


def process_file(path: Path, tolerance: int, canvas: tuple[int, int]) -> None:
    im = Image.open(path)
    im, bg = remove_bg_flood(im, tolerance=tolerance)
    out = fit_canvas(im, canvas[0], canvas[1])
    out.save(path, optimize=True)
    print(f"{path.name}: bg={bg} transparent={transparent_ratio(out):.1%}")


def main() -> None:
    process_file(BASE / "big-pool.png", tolerance=32, canvas=(128, 103))
    process_file(BASE / "small-pool.png", tolerance=32, canvas=(128, 103))

    if not USER_TEACHING.exists():
        raise SystemExit(f"Missing teaching pool source: {USER_TEACHING}")
    im = Image.open(USER_TEACHING)
    im, bg = remove_bg_flood(im, tolerance=30)
    out = fit_canvas(im, 128, 128)
    teaching_path = BASE / "teaching-pool.png"
    out.save(teaching_path, optimize=True)
    print(f"{teaching_path.name}: bg={bg} transparent={transparent_ratio(out):.1%}")


if __name__ == "__main__":
    main()
