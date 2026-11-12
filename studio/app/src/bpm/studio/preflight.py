"""실행 전 검사 화면 — 아래 탭에 보인다 (STU-01 「실행 전 검사」, F6).

**모으는 일은 `bpm.core.testrun.readiness`가 한다** — 설계 도구와 서버 실행기가 같은 검사를
보게 하려고다. 여기 있는 것은 **표 하나**와 Studio의 글 몇 줄이다.
"""

from __future__ import annotations

from collections.abc import Sequence

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHeaderView, QTableWidget, QTableWidgetItem, QWidget

from bpm.contracts import SEVERITY_ERROR, Violation
from bpm.contracts.bpmn_ext import BpmnProcess
from bpm.core.testrun.readiness import (
    CLEAN,
    PREFLIGHT_RULE,
    UNSAVED,
    inspect,
    node_of,
    readiness,
    summarize,
)

HEADERS = ("", "규칙", "무엇", "어디")

#: 노드 id가 메시지 어디에 적혀 있는지 — 「어디」 칸과 더블클릭(캔버스로 이동)이 쓴다.
_NODE_HINT = ("items", "message")

#: 키가 없을 때 「어떻게 고치나」 (STU-10). 화면 이름이 들어가므로 **부르는 쪽이** 적는다.
KEY_FIX_HINT = "Studio가 그 앱의 개발 키를 Center에 청합니다 — 받지 못했으면 설정 → 「서비스 앱」에서 까닭을 보세요"


class Preflight(QTableWidget):
    """아래 탭 「검사」. 줄을 더블클릭하면 캔버스가 그 노드를 고른다."""

    #: 캔버스에서 고를 노드 id.
    jumping = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(0, len(HEADERS), parent)
        self.process: BpmnProcess | None = None
        self.setHorizontalHeaderLabels(list(HEADERS))
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.verticalHeader().setVisible(False)
        header = self.horizontalHeader()
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.doubleClicked.connect(self._jump)

    def show_result(self, process: BpmnProcess, violations: Sequence[Violation]) -> None:
        self.process = process
        self.setRowCount(len(violations))
        for row, violation in enumerate(violations):
            blocking = violation.severity == SEVERITY_ERROR
            cells = (
                "막음" if blocking else "경고",
                violation.rule,
                violation.message + (f" — {', '.join(violation.items)}" if violation.items else ""),
                node_of(process, violation),
            )
            for column, text in enumerate(cells):
                item = QTableWidgetItem(text)
                item.setData(Qt.ItemDataRole.UserRole, cells[3])
                self.setItem(row, column, item)
        self.resizeColumnsToContents()
        header = self.horizontalHeader()
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)

    def _jump(self) -> None:
        item = self.currentItem()
        node_id = str(item.data(Qt.ItemDataRole.UserRole) or "") if item else ""
        if node_id:
            self.jumping.emit(node_id)


__all__ = [
    "CLEAN",
    "HEADERS",
    "KEY_FIX_HINT",
    "PREFLIGHT_RULE",
    "UNSAVED",
    "Preflight",
    "inspect",
    "node_of",
    "readiness",
    "summarize",
]
