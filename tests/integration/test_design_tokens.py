"""디자인 토큰이 화면으로 풀리는가 — `design/tokens.json`만 읽는다.

**Qt 테마가 보던 것을 넘겨받았다** (M11 조각 5, ADR-0143) — `shared/qt`의 시험이 「`status_map`의
모든 표기가 실제 색으로 풀리는가」를 지키고 있었는데, Qt를 걷으면 그 자리가 비어 버린다.
생성물이 원본과 맞는지는 `scripts/gen_tokens.py --check`가 보고, 여기서는 **원본 자체가
말이 되는가**를 본다.

상태 표기에 색이 빠지면 화면은 **깨지지 않고 조용히** 회색 배지에 영문을 찍는다 (계약의 상태는
열린 문자열이다 — 원칙 10). 그래서 사람이 알아채기 전에 여기서 막는다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
TOKENS: dict[str, Any] = json.loads((ROOT / "design" / "tokens.json").read_text(encoding="utf-8"))

#: 상태 색 하나가 쓰는 자리 셋 (스타일 가이드 §2-2).
PARTS = ("fg", "bg", "solid")


def test_every_status_label_has_a_color_in_both_themes() -> None:
    """`status_map`의 표기마다 색 셋이 밝게·어둡게 모두 있는가 (토큰 이름이 바뀌면 걸린다)."""
    for theme in ("light", "dark"):
        colors = TOKENS["color"][theme]
        for group, mapping in TOKENS["status_map"].items():
            for label, token in mapping.items():
                for part in PARTS:
                    key = f"status.{token}.{part}"
                    assert key in colors, f"{theme}: {group}/{label} → {key}가 없다"


def test_status_tokens_are_the_seven_the_style_guide_names() -> None:
    """색은 **일곱 가지**다 (스타일 가이드 §2-2) — 묶음마다 새 색을 만들지 않는다."""
    used = {token for mapping in TOKENS["status_map"].values() for token in mapping.values()}
    assert used <= {"neutral", "active", "done", "failed", "waiting", "warning", "replayed"}, sorted(used)
