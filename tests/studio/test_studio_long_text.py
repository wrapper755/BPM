"""STU-04 여러 줄 글 칸과 STU-04c 긴 글 편집 창 (ADR-0134)."""

from __future__ import annotations

import os
from typing import Any

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from bpm.studio.long_text import EDIT_TAB, PREVIEW_TAB, LongText, LongTextDialog  # noqa: E402


@pytest.fixture(autouse=True)
def _app() -> Any:
    from PySide6.QtWidgets import QApplication

    yield QApplication.instance() or QApplication([])


def test_the_box_keeps_the_text_and_says_when_it_changes() -> None:
    box = LongText("설명", is_markdown=True)
    seen: list[int] = []
    box.textChanged.connect(lambda: seen.append(1))
    box.setPlainText("# 제목\n\n- 하나")
    box.setPlainText("# 제목\n\n- 하나")
    assert box.toPlainText() == "# 제목\n\n- 하나"
    assert seen == [1]
    assert box.isReadOnly()


def test_markdown_boxes_draw_and_plain_boxes_do_not() -> None:
    drawn = LongText("설명", is_markdown=True)
    drawn.setPlainText("**굵게**")
    plain = LongText("템플릿")
    plain.setPlainText("**굵게** {이름}")
    assert drawn.document().toPlainText() == "굵게"
    assert plain.document().toPlainText() == "**굵게** {이름}"


def test_markdown_window_has_edit_and_preview_tabs() -> None:
    dialog = LongTextDialog("설명", "# 제목", is_markdown=True)
    assert dialog.windowTitle() == "설명 편집"
    assert dialog.tabs is not None and dialog.preview is not None
    assert [dialog.tabs.tabText(i) for i in range(dialog.tabs.count())] == [EDIT_TAB, PREVIEW_TAB]
    dialog.editor.setPlainText("# 바꾼 제목")
    dialog.tabs.setCurrentWidget(dialog.preview)
    assert dialog.preview.document().toPlainText() == "바꾼 제목"


def test_plain_window_has_no_tabs() -> None:
    dialog = LongTextDialog("본문", "{이름}님", is_markdown=False)
    assert dialog.tabs is None and dialog.preview is None
    assert dialog.text() == "{이름}님"


@pytest.mark.parametrize(("accepted", "expected"), [(True, "새 글"), (False, "옛 글")])
def test_only_ok_puts_the_text_in(monkeypatch: pytest.MonkeyPatch, accepted: bool, expected: str) -> None:
    from PySide6.QtWidgets import QDialog

    box = LongText("설명", is_markdown=True)
    box.setPlainText("옛 글")

    def run(dialog: LongTextDialog) -> int:
        dialog.editor.setPlainText("새 글")
        return QDialog.DialogCode.Accepted if accepted else QDialog.DialogCode.Rejected

    monkeypatch.setattr(LongTextDialog, "exec", run)
    box.edit()
    assert box.toPlainText() == expected


def test_a_click_or_enter_opens_the_window(monkeypatch: pytest.MonkeyPatch) -> None:
    from PySide6.QtCore import Qt
    from PySide6.QtTest import QTest

    opened: list[int] = []

    def edit(self: LongText) -> bool:
        opened.append(1)
        return True

    monkeypatch.setattr(LongText, "edit", edit)
    box = LongText("설명")
    box.show()
    QTest.mouseClick(box.viewport(), Qt.MouseButton.LeftButton)
    QTest.keyClick(box, Qt.Key.Key_Return)
    assert opened == [1, 1]


def test_a_turned_off_box_does_not_open() -> None:
    box = LongText("설명")
    box.setEnabled(False)
    assert box.edit() is False
