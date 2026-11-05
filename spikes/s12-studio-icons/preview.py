"""시안을 알파 마스크로 바꿔 토큰 색으로 칠해 밝게·어둡게 바탕 위에 나란히 놓는다 (확인용)."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
COLORS = json.loads((ROOT / "design" / "tokens.json").read_text(encoding="utf-8"))["color"]


def mask(src: Path) -> Image.Image:
    """흰 바탕·검은 그림 → 검을수록 불투명한 알파 (회색은 반투명 — 두 톤이 한 색으로 남는다)."""
    gray = ImageOps.grayscale(Image.open(src))
    return ImageOps.invert(gray).point(lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 220)))


def tint(alpha: Image.Image, color: str) -> Image.Image:
    layer = Image.new("RGBA", alpha.size, color)
    layer.putalpha(alpha)
    return layer


def board(sources: list[Path], out: Path, size: int = 360) -> None:
    rows = []
    for src in sources:
        alpha = mask(src).resize((size, size), Image.LANCZOS)
        row = Image.new("RGB", (size * 3 + 40, size + 40), "#888888")
        for i, theme in enumerate(("light", "dark")):
            bg = Image.new("RGB", (size, size), COLORS[theme]["bg.surface"])
            bg.paste(tint(alpha, COLORS[theme]["text.primary"]), (0, 0), tint(alpha, "#000"))
            row.paste(bg, (10 + i * (size + 10), 30))
        bg = Image.new("RGB", (size, size), COLORS["light"]["primary"])
        bg.paste(tint(alpha, COLORS["light"]["primary.fg"]), (0, 0), tint(alpha, "#000"))
        row.paste(bg, (10 + 2 * (size + 10), 30))
        ImageDraw.Draw(row).text((10, 8), src.stem, fill="#000000")
        rows.append(row)
    sheet = Image.new("RGB", (rows[0].width, sum(r.height for r in rows)), "#888888")
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    sheet.save(out)


if __name__ == "__main__":
    board([Path(p) for p in sys.argv[2:]], Path(sys.argv[1]))
