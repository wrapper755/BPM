"""데스크톱 칸 줄 간격은 `space.3` 하나다 (스타일 가이드 §2-4 「칸 줄 간격」).

`QFormLayout`을 만든 바로 뒤에 `setVerticalSpacing(SPACE_3)`이 없으면 Qt 기본값(스타일마다 다르다)이
들어가 그 창만 빽빽해진다 — 설정 창이 속성 패널보다 좁았던 일.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLACES = ("studio/app/src", "bot/app/src", "shared/qt/src")
MADE = re.compile(r"^\s*(\w+) = QFormLayout\(")


def test_every_form_uses_the_one_row_spacing() -> None:
    loose: list[str] = []
    for place in PLACES:
        for path in sorted((ROOT / place).rglob("*.py")):
            lines = path.read_text(encoding="utf-8").splitlines()
            for at, line in enumerate(lines):
                made = MADE.match(line)
                if made is None:
                    continue
                near = "\n".join(lines[at + 1 : at + 4])
                if f"{made.group(1)}.setVerticalSpacing(SPACE_3)" not in near:
                    loose.append(f"{path.relative_to(ROOT).as_posix()}:{at + 1}")
    assert not loose, f"칸 줄 간격을 `SPACE_3`으로 두지 않은 폼: {loose}"


def test_no_form_uses_another_row_spacing() -> None:
    other = re.compile(r"setVerticalSpacing\((?!SPACE_3\))")
    found = [
        f"{path.relative_to(ROOT).as_posix()}:{number}"
        for place in PLACES
        for path in sorted((ROOT / place).rglob("*.py"))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if other.search(line)
    ]
    assert not found, f"칸 줄 간격이 `SPACE_3`이 아니다: {found}"
