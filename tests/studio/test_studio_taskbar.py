"""작업 표시줄 아이콘 — Linux에서 `.desktop`을 **없을 때만** 써 둔다 (스타일 가이드 §6)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from bpm.studio import taskbar


@pytest.fixture(scope="module")
def app() -> Any:
    from PySide6.QtWidgets import QApplication  # noqa: PLC0415

    return QApplication.instance() or QApplication([])


def test_the_desktop_entry_is_written_once_and_points_at_its_icon(app: Any, tmp_path: Path) -> None:
    from bpm.qt.theme import icon  # noqa: PLC0415

    entry = taskbar.register_desktop_entry(tmp_path, icon("app", "#5152C1", sizes=(128,)))
    text = entry.read_text(encoding="utf-8")
    assert entry.name == "bpm-studio.desktop"
    assert f"Icon={(tmp_path / 'icons' / 'bpm-studio.png').as_posix()}" in text
    assert (tmp_path / "icons" / "bpm-studio.png").stat().st_size > 0
    entry.write_text("[Desktop Entry]\nName=사람이 고친 것\n", encoding="utf-8")
    taskbar.register_desktop_entry(tmp_path, icon("app", "#5152C1", sizes=(128,)))
    assert "사람이 고친 것" in entry.read_text(encoding="utf-8")
