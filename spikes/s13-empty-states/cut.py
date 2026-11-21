"""고른 판(`out/sheet-D.png`, 2열 × 3행)을 칸마다 잘라 **한 색 마스크 PNG**로 만든다 (ADR-0187).

흰 바탕 검정 그림 → 밝기를 알파로(검정 + 알파 — 회색 면은 반투명이 된다) → 그림만 남게 잘라 정사각에
가운데 두고 192px(96의 두 배)로 줄인다. 화면은 CSS `mask-image`로 모양을 따서 토큰 색으로 칠한다.
쓰는 법: python cut.py <판.png> <내보낼 폴더>
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

#: 칸 차례(왼→오, 위→아래)와 이름 — 프롬프트(`prompts.py`의 SCENES)와 같은 차례다.
NAMES = ["approvals", "projects", "runs", "jobs", "search", "connect"]
SIZE = 192
#: 판의 칸 사이 선(옅은 회색)을 버리려고 칸 안쪽으로 들어가 자른다.
INSET = 14


def cut(sheet: Path, out: Path) -> None:
    gray = ImageOps.grayscale(Image.open(sheet))
    w, h = gray.size
    cw, ch = w / 2, h / 3
    out.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(NAMES):
        col, row = i % 2, i // 2
        box = (int(col * cw) + INSET, int(row * ch) + INSET, int((col + 1) * cw) - INSET, int((row + 1) * ch) - INSET)
        cell = gray.crop(box)
        # 밝기 → 알파. 아주 옅은 것(바탕의 얼룩)은 버린다.
        alpha = ImageOps.invert(cell).point(lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 210)))
        bbox = alpha.getbbox()
        if bbox is None:
            raise SystemExit(f"빈 칸: {name}")
        alpha = alpha.crop(bbox)
        side = int(max(alpha.size) * 1.08)
        square = Image.new("L", (side, side), 0)
        square.paste(alpha, ((side - alpha.width) // 2, (side - alpha.height) // 2))
        square = square.resize((SIZE, SIZE), Image.LANCZOS)
        black = Image.new("LA", (SIZE, SIZE), 0)
        black.putalpha(square)
        black.convert("RGBA").save(out / f"{name}.png", optimize=True)
        print(f"썼다: {out / name}.png")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cut(Path(sys.argv[1]), Path(sys.argv[2]))
