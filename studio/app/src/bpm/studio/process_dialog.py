"""STU-06 BPM 프로세스 정보 — 폴더 하나의 성질을 고치는 창.

고치는 것이 **두 곳에 산다**. 그래서 저장도 두 걸음이고, 창이 그것을 숨기지 않는다.

- **작업 폴더 기록**(`process.json`): 이름·버전·설명·담당자·태그. Studio 안에서만 쓰는
  기록이라 계약이 아니다 (`workspace.py`). **설명만 패키지로 간다** (C1 `description`) —
  담당자·태그는 매니페스트에 칸이 없어 설계자가 보는 메모로 남는다.
- **진입 정의의 `bpm:process`**(C14): 실행 위치. 이것은 **그림**이므로
  **캔버스를 거쳐야** 고칠 수 있다 — XML을 파이썬이 직접 만지면 실행 취소와 「저장 안 한
  변경」이 깨진다 (ADR-0022, STU-04와 같은 규칙). 그래서 **진입 정의가 열려 있을 때만**
  그 칸이 켜지고, 아니면 끄고 까닭을 적는다 (U3).

지키는 것 셋.

- **「서버로 바꾸면 무엇이 걸리나」는 검사와 같은 함수로 센다** (`contracts.server_blockers`) —
  베껴 두면 창이 「바꿔도 된다」고 하고 F6이 막는 일이 생긴다. **저장을 막지는 않는다**
  (화면 설계서 STU-06) — 사람이 고칠 거리를 알려 줄 뿐이다. 확장 태스크는 실행 위치를
  **확장 정의만** 아니(C13·ADR-0018) 부르는 쪽이 표를 넘긴다 — F6이 쓰는 것과 같은 표다.
- **「서비스 앱 키」 섹션은 없다** — 키가 없다 (ADR-0102). 옛 그림에 적힌 `service_keys`는
  **그대로 둔다**(실행 전 검사가 B7 경고로 말한다) — 저장이 읽은 `bpm:process`를 통째로 되돌려 쓴다.
- **읽고 쓰는 것은 진입 정의 하나다.**
- **그림은 캔버스의 지금 것을 읽는다** — 진입 정의가 열려 있으면 메인 창이 캔버스에서 읽어
  `drawn`으로 넘긴다. 파일에서 읽으면 「적용」한 것이 다시 열었을 때 안 보인다.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping, Sequence
from dataclasses import replace

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QVBoxLayout,
    QWidget,
)

from bpm.contracts.bpmn_ext import BpmnProcess, ProcessInfo, server_blockers
from bpm.qt.theme import dress_button_box, set_role
from bpm.qt.theme.tokens import SIZE_CONTROL_MD, SPACE_3, SPACE_4
from bpm.studio.workspace import BpmProcess, Definition, Workspace, WorkspaceError, write_record

log = logging.getLogger(__name__)

TITLE = "BPM 프로세스 정보"
#: 처음 크기 — STU-10과 같은 폭을 쓴다.
DEFAULT_SIZE = (720, 440)

#: 실행 위치 (ADR-0015). 글은 STU-05와 **같은 말**을 쓴다.
#: 생략하면 서버다 (C1 R1·ADR-0016).


#: 그림을 고칠 수 없는 까닭 (U3 — 끄고 **가까이에** 적는다).
NO_CANVAS = (
    "실행 위치는 **그림**에 있습니다 (`bpm:process`) — 진입 정의 「{entry}」를 열면 고칠 수 있습니다."
)
NO_ENTRY = "정의가 없어 실행 위치를 적을 자리가 없습니다 — 먼저 정의를 저장하세요."

#: 「학습 상태 요약」 (ADR-0028).
NO_MEMORY = "재생 명세가 없습니다 (자율 수행으로 한 번 돌리면 배웁니다)."

NOTHING = "(없음)"


# ─────────────────────────── 담는 것 (Qt 없이 시험한다) ───────────────────────────


def learning(process: BpmProcess) -> str:
    """「학습 상태 요약」 — 재생 명세가 몇 개인가 (ADR-0028). 읽기 전용이다."""
    specs = process.memory().specs
    if not specs:
        return NO_MEMORY
    nodes = ", ".join(sorted(one.key.rpartition(":")[2] for one in specs))
    return f"재생 명세 {len(specs)}개 — {nodes}"


def with_drawn(process: BpmProcess, drawn: BpmnProcess | None) -> list[Definition]:
    """정의 목록에서 **진입 정의만 캔버스의 지금 그림으로** 바꾼 것 (없으면 그대로).

    열린 것은 진입 정의 하나라 나머지는 파일의 것이 지금 것이다.
    """
    entry = process.entry_definition
    if drawn is None or entry is None:
        return list(process.definitions)
    return [replace(one, process=drawn) if one.path == entry.path else one for one in process.definitions]


def server_warning(blockers: Sequence[str]) -> str:
    """「서버」를 골랐을 때 보일 한 줄 (STU-06). 걸리는 것이 없으면 빈 글이다."""
    if not blockers:
        return ""
    return (
        f"서버에서 실행할 수 없는 태스크 {len(blockers)}개 — 실행 전 검사에서 오류로 "
        "표시됩니다: " + ", ".join(blockers)
    )


def check(*, name: str, version: str, taken: Mapping[str, str], was: str = "") -> str:
    """저장 전 검사. 빈 글이면 괜찮다 — **첫 흠 하나만** 말한다 (빨간 글자 한 줄이다).

    `taken`은 다른 BPM 프로세스의 `{이름: id}`다. 겹침은 **이름을 바꿀 때만** 본다 —
    이미 겹친 채 있는 이름(복사해 만든 것)이 버전·설명 고치기를 막으면 안 된다.
    id를 함께 적는 것은 상대가 목록에서 닫혀 있어 보이지 않을 수 있어서다.
    """
    if not name.strip():
        return "이름을 적으세요."
    if name.strip() != was.strip() and name.strip() in taken:
        return f"같은 이름의 BPM 프로세스가 있습니다: {name.strip()} (id {taken[name.strip()]})"
    if not re.fullmatch(r"\d+\.\d+\.\d+", version.strip()):
        return f"버전은 `1.0.0` 모양입니다 (받은 값 {version.strip() or '빈 값'})."
    return ""


# ─────────────────────────── 창 ───────────────────────────


class ProcessInfoDialog(QDialog):
    """STU-06. **「적용」을 누를 때까지 아무것도 바뀌지 않는다** (STU-10과 같은 결).

    「적용」은 기록을 바로 쓰고 그림은 캔버스에만 넘긴다 — 파일로 가는 것은 Ctrl+S다.
    """

    def __init__(
        self,
        process: BpmProcess,
        workspace: Workspace,
        *,
        editable: bool = True,
        drawn: BpmnProcess | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.process = process
        self.workspace = workspace
        #: 진입 정의가 열려 있나 — 열려 있으면 **캔버스의 그림**으로 「서버에서 못 하는 것」을 센다.
        self.editable = editable
        #: 「적용」을 눌러 저장된 기록.
        self.saved: BpmProcess | None = None

        entry = process.entry_definition
        self.entry = entry
        #: 지금 그림 — 진입 정의가 열려 있으면 **캔버스의 것**(`drawn`)이다. 파일에서 읽으면
        #: 「적용」한 것이 다시 열었을 때 안 보인다 (Ctrl+S 전에는 파일에 없다).
        self.drawn = drawn if editable else None
        self.definitions = with_drawn(process, self.drawn)
        found = self.drawn or (entry.process if entry is not None else None)
        self.info = found.info.model_copy(deep=True) if found is not None else ProcessInfo()

        self.setWindowTitle(TITLE)
        self.resize(*DEFAULT_SIZE)

        self.name_box = QLineEdit(process.name, self)
        self.version_box = QLineEdit(process.version, self)
        self.description_box = QPlainTextEdit(process.description, self)
        self.description_box.setFixedHeight(72)
        self.owner_box = QLineEdit(process.owner, self)
        self.tags_box = QLineEdit(", ".join(process.tags), self)
        self.tags_box.setPlaceholderText("쉼표로 구분 — 재무, 월말")

        self.warning = QLabel("", self)
        self.warning.setWordWrap(True)
        self.warning.setObjectName("serverWarning")

        # [I] 읽기 전용 셋 — 흐린 글자로 위에 모은다 (STU-06 배치).
        captions: list[QLabel] = []
        facts = QFormLayout()
        facts.setVerticalSpacing(SPACE_3)
        facts.setHorizontalSpacing(SPACE_4)
        for text, shown in (
            ("id", self._fixed(process.id)),
            ("폴더", self._path(process.folder.as_posix())),
            ("학습 상태", self._fixed(learning(process))),
        ):
            caption = QLabel(text, self)
            set_role(caption, "muted")
            set_role(shown, "muted")
            facts.addRow(caption, shown)
            captions.append(caption)

        # [F] 편집 칸 — 이름표는 한 줄 칸의 세로 가운데에 맞춘다 (설명은 첫 줄).
        form = QFormLayout()
        form.setVerticalSpacing(SPACE_3)
        form.setHorizontalSpacing(SPACE_4)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        fields: tuple[tuple[str, QWidget], ...] = (
            ("이름", self.name_box),
            ("버전", self.version_box),
            ("설명", self.description_box),
            ("담당자", self.owner_box),
            ("태그", self.tags_box),
        )
        for text, field in fields:
            caption = QLabel(text, self)
            caption.setMinimumHeight(SIZE_CONTROL_MD)
            caption.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
            form.addRow(caption, field)
            captions.append(caption)
        # 두 묶음의 이름표 열을 같은 너비로 — 칸의 왼쪽 끝이 한 줄에 선다.
        width = max(one.sizeHint().width() for one in captions)
        for one in captions:
            one.setMinimumWidth(width)

        #: 아래 한 줄 — 검사 오류와 안내를 여기로만 말한다 (STU-10과 같은 결).
        self.note = QLabel("", self)
        self.note.setWordWrap(True)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, parent=self
        )
        buttons.button(QDialogButtonBox.StandardButton.Ok).setText("적용")
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("취소")
        dress_button_box(buttons)  # 우리 아이콘·채운 단추 하나 (스타일 가이드 §6)
        buttons.button(QDialogButtonBox.StandardButton.Ok).clicked.connect(self.save)
        buttons.rejected.connect(self.reject)
        self.buttons = buttons

        warning_row = QHBoxLayout()
        warning_row.addWidget(self.warning, 1)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(SPACE_4, SPACE_4, SPACE_4, SPACE_4)
        layout.setSpacing(SPACE_3)
        layout.addLayout(facts)
        layout.addWidget(self._rule())
        layout.addLayout(form)
        layout.addLayout(warning_row)
        layout.addWidget(self.note)
        layout.addWidget(self._rule())
        layout.addWidget(buttons)

        self._note_the_graph()
        self._refresh_warning()
        self.note.setVisible(bool(self.note.text()))
        # 창 높이는 내용에 맞춘다 — 남는 빈 곳을 두지 않는다 (STU-06 배치).
        self.resize(DEFAULT_SIZE[0], self.sizeHint().height())

    # ── 짜기 ──

    def _fixed(self, text: str) -> QLabel:
        found = QLabel(text or NOTHING, self)
        found.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        found.setWordWrap(True)
        return found

    def _path(self, text: str) -> QLabel:
        """긴 경로는 가운데를 줄이고 툴팁이 전체다 (그래도 마우스로 고를 수 있다)."""
        found = QLabel(self)
        found.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        found.setToolTip(text)
        room = DEFAULT_SIZE[0] - 2 * SPACE_4 - 120
        found.setText(found.fontMetrics().elidedText(text, Qt.TextElideMode.ElideMiddle, room))
        return found

    def _rule(self) -> QFrame:
        rule = QFrame(self)
        rule.setObjectName("Rule")  # 토큰 색 가로선 (STU-01 「변수」 탭과 같은 것)
        return rule

    def _note_the_graph(self) -> None:
        """그림을 읽을 수 없으면 까닭을 적는다 (기록은 그래도 저장된다)."""
        if self.editable and self.entry is not None:
            return
        why = NO_ENTRY if self.entry is None else NO_CANVAS.format(entry=self.entry.path.name)
        self.note.setText(why)
        self.note.setTextFormat(Qt.TextFormat.MarkdownText)

    # ── 돌릴 수 없는 것 ──

    def blockers(self) -> list[str]:
        """돌릴 수 없는 태스크들 — **검사와 같은 함수**다 (`contracts.server_blockers`)."""
        found = self.drawn or (self.entry.process if self.entry is not None else None)
        if found is None:
            return []
        return server_blockers(found)

    def _refresh_warning(self) -> None:
        """**저장을 막지 않는다** (화면 설계서 STU-06)."""
        found = server_warning(self.blockers())
        self.warning.setText(found)
        self.warning.setVisible(bool(found))

    # ── 저장 ──

    def save(self) -> None:
        """두 곳에 쓴다 — 기록은 여기서, **그림은 부르는 쪽이 캔버스로** (XML을 만지지 않는다).

        검사에 걸리면 **창을 닫지 않는다** (STU-10과 같은 결).
        """
        taken = {
            one.name: one.id
            for group in self.workspace.groups()
            for one in group.processes
            if one.id != self.process.id and one.name
        }
        problem = check(
            name=self.name_box.text(),
            version=self.version_box.text(),
            taken=taken,
            was=self.process.name,
        )
        if problem:
            self.note.setText(problem)
            self.note.setVisible(True)
            self.note.setTextFormat(Qt.TextFormat.PlainText)
            return

        made = BpmProcess(
            id=self.process.id,
            folder=self.process.folder,
            group=self.process.group,
            name=self.name_box.text().strip(),
            version=self.version_box.text().strip(),
            entry=self.process.entry,
            description=self.description_box.toPlainText().strip(),
            owner=self.owner_box.text().strip(),
            tags=tuple(one.strip() for one in self.tags_box.text().split(",") if one.strip()),
            definitions=self.process.definitions,
        )
        try:
            write_record(made)
        except (OSError, WorkspaceError) as e:
            self.note.setText(f"기록을 쓰지 못했습니다: {e}")
            self.note.setVisible(True)
            return

        self.saved = made
        self.accept()


__all__ = [
    "DEFAULT_SIZE",
    "NO_CANVAS",
    "NO_ENTRY",
    "NO_MEMORY",
    "TITLE",
    "ProcessInfoDialog",
    "check",
    "learning",
    "server_warning",
    "with_drawn",
]
