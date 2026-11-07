"""Studio에 들일 아이콘 목록과 한 장씩 만드는 프롬프트 — 시안 A(선)의 모양을 글로 적는다.

참고 그림을 함께 보내면 그 판을 통째로 다시 그려 넣어서 보내지 않는다.
"""

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from gen import generate

STYLE = (
    "Draw exactly ONE single UI icon, centered on a pure white background, pure black (#000000) lines only. "
    "Only this one icon and nothing else in the image. Style: clean geometric outline icon, uniform stroke "
    "about 1/12 of the icon width, rounded line caps and joins, no fills except tiny dots, no shading, "
    "no gradients, no text, no letters, no frame or circle around the icon, generous margin. Subject: "
)

ICONS: dict[str, str] = {
    "save": "a minimal floppy disk (save): one rounded square outline with the top-right corner cut, a small empty rectangle at the top, and one empty rectangle at the bottom; no other details, no text lines",
    "undo-2": "undo — a curved arrow bending back to the left, arrow head pointing left",
    "redo-2": "redo — a curved arrow bending to the right, arrow head pointing right",
    "list-checks": "a checklist: three short horizontal lines each with a small check mark on the left",
    "play": "a play triangle pointing right with rounded corners, no circle",
    "square": "a plain rounded square (stop)",
    "panel-right-close": "a rounded rectangle window with a vertical divider near the right side and a small chevron pointing right inside the right panel (collapse side panel)",
    "plus": "a plus sign made of two very thin hairline strokes",
    "trash": "a trash can with lid and two vertical lines on the body",
    "folder": "a closed folder",
    "process": "a compact square-shaped process flow: a small circle at the top-left, a line down to a rounded rectangle at the bottom-left, a line right to a small diamond at the bottom-right — the whole drawing fits a square",
    "definition": "a document page with a folded top-right corner, containing a tiny circle connected to a tiny rounded rectangle",
    "arrow-up": "a straight arrow pointing up",
    "arrow-down": "a straight arrow pointing down",
    "refresh": "two curved arrows forming a circle (refresh / reload)",
    "plug": "an electric plug with two prongs (connection test)",
    "folder-open": "an open folder",
    "pencil": "a pencil drawn diagonally (edit)",
    "copy": "two overlapping rounded rectangles (copy)",
    "send": "a paper plane (send)",
    "wand": "a magic wand with three small sparkle lines near its tip (auto fill)",
    "download": "an arrow pointing down into an open tray (install / download)",
    "power": "a power symbol: ONE single open circle stroke with a gap at the top and one vertical line through the gap; no second ring, no inner circle, very simple",
    "pin": "a push pin drawn diagonally",
    "pin-off": "a push pin drawn diagonally with a single diagonal slash line crossing it",
    "file-plus": "a document page with a folded top-right corner and a plus sign in the middle",
    "check": "a single check mark drawn with ONE very thin hairline stroke (OK / confirm)",
    "x": "a single X made of two crossing diagonal very thin hairline strokes (cancel / close)",
    "upload": "an arrow pointing up out of an open tray (upload)",
    "clock": "a clock face circle with two hands (later)",
    "app": "a solid rounded square tile filled completely black; inside it, cut out in white, a horizontal flow: a small hollow circle, a short line, a small rounded rectangle, a short line, a small hollow diamond. White cut-out lines, black tile",
}


def make(name: str, out_dir: Path, ref: Path) -> None:
    out = out_dir / f"{name}.png"
    if out.exists():
        return
    generate(out, STYLE + ICONS[name], [])


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    out_dir, ref = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    names = sys.argv[3:] or list(ICONS)
    with ThreadPoolExecutor(6) as pool:
        for future in [pool.submit(make, n, out_dir, ref) for n in names]:
            future.result()
