"""STU-12b 「서버로 올리기」 확인 창 — **업무 자리를 고른다** (C16, ADR-0127).

고른 자리는 매니페스트(C1 `place`)에 실려 승인과 함께 고정된다 — Center는 보여 주기만 한다. 목록은 이
Studio 키로 읽은 **제 회사의 조직**이고, 읽지 못하면 「회사 공통」만 켠다.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QButtonGroup,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFrame,
    QGridLayout,
    QLabel,
    QRadioButton,
    QVBoxLayout,
    QWidget,
)

from bpm.qt.theme import dress_button_box, set_role
from bpm.qt.theme.tokens import SPACE_3, SPACE_4
from bpm.studio.upload import Organization, OrgChoice
from bpm.studio.workspace import BpmProcess

NOTE = "업무 자리는 패키지에 들어가 승인과 함께 고정됩니다. 바꾸려면 버전을 올려 다시 올리세요."
NO_ORG = "서버에서 조직을 읽지 못해 「회사 공통」만 고를 수 있습니다."
NOBODY = "(없음)"
#: 콤보가 이름을 자르지 않을 만큼.
WIDTH = 480


class UploadDialog(QDialog):
    """무엇을 어디로(글로만) + 「업무 자리」(회사 공통 / 부서 / 직원) — 두 열 하나."""

    def __init__(self, parent: QWidget | None, process: BpmProcess, org: Organization | None) -> None:
        super().__init__(parent)
        self.setWindowTitle(f"서버로 올리기 — {process.display} {process.version}")
        self.setMinimumWidth(WIDTH)
        self.org = org

        self.company = QRadioButton("회사 공통", self)
        self.department = QRadioButton("부서", self)
        self.staff = QRadioButton("직원", self)
        self.group = QButtonGroup(self)
        for one in (self.company, self.department, self.staff):
            self.group.addButton(one)
            one.toggled.connect(self._refresh)
        self.departments = self._combo(org.departments if org else ())
        self.people = self._combo(org.staff if org else ())

        # 무엇을 어디로(글로만 — 회사는 고를 수 없다, Studio는 회사 소유다)와 업무 자리가 **두 열 하나**다 —
        # 라디오는 위의 이름과 같은 열, 콤보는 위의 값과 같은 열에 선다.
        name = QLabel(process.display, self)
        bold = name.font()
        bold.setBold(True)
        name.setFont(bold)
        title = QLabel("업무 자리", self)
        title.setFont(bold)
        rule = QFrame(self)
        rule.setObjectName("Rule")  # 묶음 제목 아래 선 (스타일 가이드 §3 Section)
        rule.setFrameShape(QFrame.Shape.HLine)

        grid = QGridLayout()
        grid.setHorizontalSpacing(SPACE_4)
        grid.setVerticalSpacing(SPACE_3)
        rows: list[tuple[QLabel, QLabel]] = [
            (QLabel("BPM 프로세스", self), name),
            (QLabel("버전", self), QLabel(process.version, self)),
            (QLabel("회사", self), QLabel(org.company_name if org else "—", self)),
        ]
        for row, (label, value) in enumerate(rows):
            grid.addWidget(label, row, 0)
            grid.addWidget(value, row, 1)
        grid.setRowMinimumHeight(len(rows), SPACE_3)  # 묶음 사이 (§3 Section)
        grid.addWidget(title, len(rows) + 1, 0, 1, 2)
        grid.addWidget(rule, len(rows) + 2, 0, 1, 2)
        grid.addWidget(self.company, len(rows) + 3, 0, 1, 2)
        grid.addWidget(self.department, len(rows) + 4, 0)
        grid.addWidget(self.departments, len(rows) + 4, 1)
        grid.addWidget(self.staff, len(rows) + 5, 0)
        grid.addWidget(self.people, len(rows) + 5, 1)
        grid.setColumnStretch(1, 1)

        self.buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, parent=self
        )
        self.buttons.button(QDialogButtonBox.StandardButton.Ok).setText("올리기")
        dress_button_box(self.buttons)  # 우리 아이콘·채운 단추 하나 (스타일 가이드 §6)
        self.buttons.accepted.connect(self.accept)
        self.buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.setSpacing(SPACE_3)
        layout.addLayout(grid)
        self.note = QLabel(NOTE if org else NO_ORG, self)
        self.note.setWordWrap(True)
        set_role(self.note, "muted")
        layout.addWidget(self.note)
        layout.addWidget(self.buttons)
        self._preselect(process.place)

    def _combo(self, items: tuple[OrgChoice, ...]) -> QComboBox:
        box = QComboBox(self)
        for one in items:
            box.addItem(one.label, one.id)
        if not items:
            box.addItem(NOBODY, None)
        return box

    def _preselect(self, place: dict[str, str] | None) -> None:
        """지난번 고른 것을 미리 고른다 — 지금 목록에 없으면 회사 공통으로 돌아간다."""
        scope = (place or {}).get("scope")
        for button, combo, key in ((self.department, self.departments, "department"),
                                   (self.staff, self.people, "staff")):
            if scope == key and combo.findData((place or {}).get(key)) >= 0:
                combo.setCurrentIndex(combo.findData((place or {}).get(key)))
                button.setChecked(True)
                return
        self.company.setChecked(True)

    def _refresh(self) -> None:
        has_departments = self.departments.currentData() is not None
        has_staff = self.people.currentData() is not None
        self.department.setEnabled(self.org is not None and has_departments)
        self.staff.setEnabled(self.org is not None and has_staff)
        self.departments.setEnabled(self.department.isChecked())
        self.people.setEnabled(self.staff.isChecked())

    def place(self) -> dict[str, str] | None:
        """고른 자리 (C16 `Place`의 JSON). 회사 공통이면 `None` — 매니페스트에 넣지 않는다."""
        if self.department.isChecked() and self.departments.currentData():
            return {"scope": "department", "department": str(self.departments.currentData())}
        if self.staff.isChecked() and self.people.currentData():
            return {"scope": "staff", "staff": str(self.people.currentData())}
        return None

    @classmethod
    def ask(
        cls, parent: QWidget | None, process: BpmProcess, org: Organization | None
    ) -> tuple[bool, dict[str, str] | None]:
        """`(올리나, 자리)` — 「취소」면 `(False, None)`."""
        dialog = cls(parent, process, org)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return False, None
        return True, dialog.place()


__all__ = ["NOTE", "NO_ORG", "UploadDialog"]
