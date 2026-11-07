"""STU-01 도움말 → 「정보...」 — 이 Studio가 어느 판인가.

판은 **빌드가 찍은 것**을 읽는다 (`core.build_info`, ADR-0067) — 여기서 짓지 않는다. 묶지 않고
소스에서 띄우면 찍힌 것이 없어 커밋·빌드한 때 대신 그렇게 말한다. 실행 환경·오픈소스 고지는
설정(STU-10) 쪽 자리라 두지 않는다.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)

from bpm.core import build_info
from bpm.qt.theme import dress_button_box, set_role
from bpm.qt.theme.tokens import SPACE_3

TITLE = "BPM Studio 정보"
NAME = "BPM Studio"
#: 묶지 않고 소스에서 띄웠을 때 — 커밋·빌드한 때 자리에 한 줄.
FROM_SOURCE = "소스에서 실행 — 빌드가 찍은 정보가 없습니다"
ICON_SIZE = 64
WIDTH = 360


def rows(stamp: build_info.Stamp | None, version: str) -> list[tuple[str, str]]:
    """창에 보일 `(이름, 값)` 줄 — 찍힌 것이 없으면 판과 안내 한 줄."""
    if stamp is None:
        return [("판", version), ("", FROM_SOURCE)]
    return [("판", stamp.version), ("커밋", stamp.commit), ("빌드한 때", stamp.built_at)]


class AboutDialog(QDialog):
    def __init__(self, parent: QWidget | None = None, *, stamp: build_info.Stamp | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle(TITLE)
        self.setMinimumWidth(WIDTH)
        found = stamp if stamp is not None else build_info.stamp()
        self.rows = rows(found, build_info.product_version("bpm-studio"))

        head = QHBoxLayout()
        picture = QLabel(self)
        picture.setPixmap(self.windowIcon().pixmap(ICON_SIZE, ICON_SIZE))
        head.addWidget(picture)
        name = QLabel(NAME, self)
        set_role(name, "h2")
        head.addWidget(name)
        head.addStretch(1)

        form = QFormLayout()

        form.setVerticalSpacing(SPACE_3)
        for label, value in self.rows:
            shown = QLabel(value, self)
            if label:
                form.addRow(label, shown)
            else:
                set_role(shown, "muted")
                form.addRow(shown)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Close, self)
        buttons.rejected.connect(self.reject)
        dress_button_box(buttons)

        box = QVBoxLayout(self)
        box.setSpacing(SPACE_3)
        box.addLayout(head)
        box.addLayout(form)
        box.addWidget(buttons)


__all__ = ["FROM_SOURCE", "TITLE", "AboutDialog", "rows"]
