"""속성 편집기의 폼 줄 사이는 `space.3`이다 (STU-04) — 하나만 촘촘하면 눈에 띈다.

편집기마다 띄워 보지 않고 **소스를 읽어** 본다: 폼 레이아웃을 만든 바로 다음 줄이
`setVerticalSpacing(SPACE_3)`인가.
"""

from __future__ import annotations

import re
from pathlib import Path

STUDIO = Path(__file__).resolve().parents[2] / "studio" / "app" / "src" / "bpm" / "studio"

#: 속성 패널에 끼는 편집기 — 플랫폼이 가진 것 (STU-04·STU-14).
EDITORS = (
    "properties",
    "approval_editor",
    "service_editor",
    "ai_task_editor",
    "send_editor",
    "call_editor",
    "loop_editor",
    "event_editor",
    "data_output_editor",
    "defaults_editor",
)

MADE = re.compile(r"^\s*((?:self\.)?\w+) = QFormLayout\(")


def test_every_editor_form_uses_the_same_row_gap() -> None:
    loose: list[str] = []
    for name in EDITORS:
        lines = (STUDIO / f"{name}.py").read_text(encoding="utf-8").splitlines()
        for number, line in enumerate(lines):
            made = MADE.match(line)
            if made is None:
                continue
            following = "\n".join(lines[number + 1 : number + 4])
            if f"{made.group(1)}.setVerticalSpacing(SPACE_3)" not in following:
                loose.append(f"{name}.py:{number + 1}")
    assert not loose, f"폼 줄 사이가 space.3이 아니다: {loose}"


THEME = Path(__file__).resolve().parents[2] / "shared" / "qt" / "src" / "bpm" / "qt" / "theme"


def test_editor_tabs_are_white_and_table_combos_have_room() -> None:
    """편집기 탭 바탕은 카드와 같은 흰색, 표 칸 콤보는 칸 선에서 띄운다 (스타일 가이드 §4-2)."""
    source = (STUDIO / "properties.py").read_text(encoding="utf-8")
    assert 'setObjectName("EditorHolder")' in source
    for theme in ("light", "dark"):
        qss = (THEME / f"theme-{theme}.qss").read_text(encoding="utf-8")
        assert "QScrollArea#EditorHolder" in qss, theme
        assert "QAbstractItemView QComboBox" in qss, theme
