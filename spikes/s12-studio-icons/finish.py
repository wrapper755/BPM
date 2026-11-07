"""생성한 그림 → 제품 아이콘 마스크(`icon-<이름>.png`, 128px, 검정 + 알파) 그리고 확인용 판.

쓰는 법: python finish.py <raw 폴더> <내보낼 폴더> <판.png>
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

SIZE = 128
MARGIN = 0.08  # Lucide처럼 24 칸에 2 여백 ≈ 8%
WORK = 512  # 굵게 하는 일은 네 배 크기에서 한다
STROKE = 8.0  # 128px에서 선 굵기 — 20px에서 1.25px. Lucide(2/24 = 10.7)만큼 굵히면 잔 그림(저장·전원)이 메워진다


def mask(src: Path) -> Image.Image:
    gray = ImageOps.grayscale(Image.open(src))
    alpha = ImageOps.invert(gray).point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 255 / 200)))
    box = alpha.getbbox()
    if box is None:
        raise SystemExit(f"빈 그림: {src}")
    alpha = alpha.crop(box)
    side = int(max(alpha.size) / (1 - 2 * MARGIN))
    square = Image.new("L", (side, side), 0)
    square.paste(alpha, ((side - alpha.width) // 2, (side - alpha.height) // 2))
    return thicken(square.resize((WORK, WORK), Image.LANCZOS)).resize((SIZE, SIZE), Image.LANCZOS)


def thicken(alpha: Image.Image) -> Image.Image:
    """선을 STROKE까지 둥글게 굵힌다 — 지금 굵기를 재고, 흐린 뒤 문턱을 낮춰 테두리를 바깥으로 민다."""
    now = stroke_width(alpha)
    grow = max(0.0, (STROKE * WORK / SIZE - now) / 2)
    if grow < 1:
        return alpha
    blurred = alpha.filter(ImageFilter.GaussianBlur(grow))
    # 흐린 값은 선 가운데에서 멀어질수록 떨어진다 — 낮은 문턱을 넘는 곳까지 칠하면 grow만큼 넓어진다.
    return blurred.point(lambda v: 0 if v < 18 else min(255, (v - 18) * 6))


def stroke_width(alpha: Image.Image) -> float:
    """가로줄마다 칠한 구간의 길이 중앙값 (선이 대부분이라 굵기와 같다)."""
    runs = []
    width, height = alpha.size
    data = alpha.load()
    for y in range(0, height, 4):
        run = 0
        for x in range(width):
            if data[x, y] > 128:
                run += 1
            elif run:
                runs.append(run)
                run = 0
    runs.sort()
    return float(runs[len(runs) // 2]) if runs else 0.0


def save(alpha: Image.Image, out: Path) -> None:
    black = Image.new("RGBA", alpha.size, (0, 0, 0, 255))
    black.putalpha(alpha)
    black.save(out, optimize=True)


def board(alphas: dict[str, Image.Image], out: Path) -> None:
    cell = 150
    cols = 7
    rows = (len(alphas) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell * 2), "#FFFFFF")
    draw = ImageDraw.Draw(sheet)
    for i, (name, alpha) in enumerate(alphas.items()):
        x, y = (i % cols) * cell, (i // cols) * cell * 2
        for j, (bg, fg) in enumerate((("#FFFFFF", "#0A0A0A"), ("#171717", "#F5F5F5"))):
            top = y + j * cell
            sheet.paste(bg, (x, top, x + cell, top + cell))
            layer = Image.new("RGB", (SIZE, SIZE), fg)
            big = alpha.resize((80, 80), Image.LANCZOS)
            sheet.paste(layer.resize((80, 80)), (x + 10, top + 30), big)
            small = alpha.resize((20, 20), Image.LANCZOS)
            sheet.paste(Image.new("RGB", (20, 20), fg), (x + 110, top + 60), small)
            draw.text((x + 6, top + 6), name, fill=fg)
    sheet.save(out)


if __name__ == "__main__":
    raw, out_dir, board_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    alphas = {p.stem: mask(p) for p in sorted(raw.glob("*.png"))}
    # 짝은 뒤집어 짓는다 — 따로 그리면 모양이 서로 달라진다.
    alphas["redo-2"] = ImageOps.mirror(alphas["undo-2"])
    alphas["arrow-up"] = ImageOps.flip(alphas["arrow-down"])
    for name, alpha in alphas.items():
        save(alpha, out_dir / f"icon-{name}.png")
    board(alphas, board_path)
