"""STU-04 여러 줄 글 칸 — 읽기 전용 상자와 STU-04c 긴 글 편집 창 (ADR-0134).

속성 패널은 좁아 긴 글을 그 자리에서 쓰기 어렵다. 칸은 **읽기 전용으로 보이고** 누르면 넓은 창에서
고친다. 창의 「확인」만 칸에 넣는다 — 그림에 넣는 것은 편집기의 「적용」이다(지금과 같다).

편집기는 `QPlainTextEdit`를 쓰던 자리에 그대로 끼운다 — `toPlainText`·`setPlainText`·
`setPlaceholderText`·`textChanged`가 같다. **Markdown 칸**은 상자에 그려서 보이고 창에 「미리보기」
탭이 있다. 그리는 함수는 결재 창(CMN-01)과 **하나**다 (`bpm.qt.markdown`).
"""

from __future__ import annotations

from PySide6.QtCore import QEvent, QObject, Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QPlainTextEdit,
    QTabWidget,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from bpm.qt import markdown
from bpm.qt.theme import dress_button_box
from bpm.qt.theme.tokens import SPACE_1, SPACE_3

#: 상자를 누르면 무엇이 일어나는지 — 툴팁.
TIP = "누르면 편집 창이 열립니다"
EDIT_TAB, PREVIEW_TAB = "편집", "미리보기"
#: STU-04c 크기.
DIALOG_SIZE = (720, 520)
DIALOG_MIN = (560, 400)
#: 상자를 여는 키 (포커스가 있을 때).
OPEN_KEYS = (Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Space)


class LongTextDialog(QDialog):
    """STU-04c — 「<칸 이름> 편집」. Markdown 칸만 「편집」·「미리보기」 탭이 있다."""

    def __init__(
        self, label: str, text: str, *, is_markdown: bool, placeholder: str = "", parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle(f"{label} 편집")
        self.setMinimumSize(*DIALOG_MIN)
        self.resize(*DIALOG_SIZE)
        self.editor = QPlainTextEdit(text, self)
        self.editor.setPlaceholderText(placeholder)
        self.preview: QTextBrowser | None = None
        self.tabs: QTabWidget | None = None

        box = QVBoxLayout(self)
        box.setSpacing(SPACE_3)
        if is_markdown:
            self.preview = QTextBrowser(self)
            self.preview.setOpenLinks(False)
            self.preview.anchorClicked.connect(lambda url: markdown.open_link(url.toString()))
            self.tabs = QTabWidget(self)
            self.tabs.addTab(self.editor, EDIT_TAB)
            self.tabs.addTab(self.preview, PREVIEW_TAB)
            self.tabs.currentChanged.connect(self._repaint_preview)
            box.addWidget(self.tabs, 1)
        else:
            box.addWidget(self.editor, 1)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, self
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        dress_button_box(buttons)
        box.addWidget(buttons)
        self.editor.setFocus()

    def text(self) -> str:
        return self.editor.toPlainText()

    def _repaint_preview(self, index: int) -> None:
        if self.preview is not None and self.tabs is not None and self.tabs.widget(index) is self.preview:
            self.preview.setHtml(markdown.to_html(self.text()))


class LongText(QTextBrowser):
    """읽기 전용 상자 — `lines` 줄이 보이고, 누르면 STU-04c가 열린다."""


    def __init__(
        self, label: str, *, is_markdown: bool = False, lines: int = 4, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.label = label
        self.is_markdown = is_markdown
        self.lines = lines
        self._text = ""
        self._placeholder = ""
        self.setReadOnly(True)
        self.setOpenLinks(False)
        self.setToolTip(TIP)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.viewport().setCursor(Qt.CursorShape.PointingHandCursor)
        self.viewport().installEventFilter(self)
        self._fit()

    # ── QPlainTextEdit을 쓰던 자리와 같은 길 ──
    def toPlainText(self) -> str:  # noqa: N802 — Qt 이름 그대로
        return self._text

    def setPlainText(self, text: str) -> None:  # noqa: N802
        changed = text != self._text
        self._text = text
        self._paint()
        if changed:
            self.textChanged.emit()

    def setPlaceholderText(self, text: str) -> None:  # noqa: N802
        self._placeholder = text
        super().setPlaceholderText(text)

    # ── 편집 창 ──
    def make_dialog(self) -> LongTextDialog:
        """시험이 띄우지 않고 쓰는 자리 — `edit()`가 이것을 연다."""
        return LongTextDialog(
            self.label, self._text, is_markdown=self.is_markdown, placeholder=self._placeholder, parent=self
        )

    def edit(self) -> bool:
        """STU-04c를 열고 「확인」이면 칸에 넣는다."""
        if not self.isEnabled():
            return False
        dialog = self.make_dialog()
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return False
        self.setPlainText(dialog.text())
        return True

    # ── 그리기 ──
    def _paint(self) -> None:
        # `textChanged`는 **글(원문)이 바뀔 때만** 울린다 — 그리기가 울리면 편집기가 「바뀌었다」로 읽는다.
        quiet = self.blockSignals(True)
        try:
            if self.is_markdown:
                super().setHtml(markdown.to_html(self._text))
            else:
                super().setPlainText(self._text)
        finally:
            self.blockSignals(quiet)

    def _fit(self) -> None:
        margin = int(self.document().documentMargin()) * 2 + SPACE_1
        self.setFixedHeight(self.fontMetrics().lineSpacing() * self.lines + margin)

    def changeEvent(self, event: QEvent) -> None:  # noqa: N802
        super().changeEvent(event)
        if event.type() == QEvent.Type.FontChange:  # 테마 글꼴은 띄운 뒤에 닿는다
            self._fit()

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802
        if event.key() in OPEN_KEYS:
            self.edit()
            return
        super().keyPressEvent(event)

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:  # noqa: N802
        if (
            watched is self.viewport()
            and event.type() == QEvent.Type.MouseButtonRelease
            and getattr(event, "button", lambda: None)() == Qt.MouseButton.LeftButton
        ):
            self.edit()
            return True
        return super().eventFilter(watched, event)


__all__ = ["DIALOG_SIZE", "EDIT_TAB", "PREVIEW_TAB", "TIP", "LongText", "LongTextDialog"]
