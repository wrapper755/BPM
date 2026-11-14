"""STU-06 BPM 프로세스 정보 (M6 조각 22).

보는 것:

1. **고치는 것이 두 곳에 산다** — 기록(`process.json`)은 창이 쓰고, 그림(`bpm:process`)은
   **캔버스가** 쓴다. 진입 정의가 열려 있지 않으면 그 두 칸은 끄고 까닭을 적는다 (U3).
2. **읽은 것을 통째로 되돌려 쓴다** — `extensions`·`inputs`·`outputs`를 빼면 그 선언이 사라진다.
3. **「서버로 바꾸면 무엇이 걸리나」는 검사와 같은 함수로 센다** (`contracts.server_blockers`) —
   어긋나면 「검사는 통과했는데 창이 막는다」가 된다. **저장은 막지 않는다.**
4. **「서비스 앱 키」 섹션은 없다** (ADR-0094) — 키는 Center가 내려 주고, 그림에 적힌 참조는
   **그대로** 간다.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import fake_extension
import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from bpm.contracts.bpmn_ext import server_blockers  # noqa: E402
from bpm.contracts.bpmn_ext import validate as validate_bpmn  # noqa: E402
from bpm.studio import process_dialog as module  # noqa: E402
from bpm.studio.packaging import build_manifest  # noqa: E402
from bpm.studio.process_dialog import (  # noqa: E402
    ProcessInfoDialog,
    check,
    learning,
    server_warning,
)
from bpm.studio.workspace import BpmProcess, Workspace, read_record  # noqa: E402

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "08-business-examples" / "bpmn"

#: 서비스 앱을 키 참조로 부르는 예제 (`ext-credit` / `finance-credit`).
CREDIT = "bx06_bulk_credit_check"
#: **현장 확인**이 있어 서버에서 돌 수 없는 예제 — 플랫폼이 혼자 아는 것들이다.
PC_EXAMPLE = "fx19_manual_task_pc"
#: **확장 태스크**가 있는 그림 (시험용 확장, `tests/fake_extension.py`). 실행 위치는 플랫폼이
#: 모르고 **확장 정의만** 안다 (C13·ADR-0018) — 부르는 쪽이 넘긴 표로 센다.
EXTENSION_EXAMPLE = fake_extension.DRAWING
#: 그 표 (`ExtensionHost.task_type_locations()`가 주는 모양). 이 태스크는 PC에서만 돈다.
UI_TASK_ON_PC = {"fake_task": ["pc"]}


@pytest.fixture
def space(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path / "작업").ensure()


def imported(space: Workspace, example: str = CREDIT) -> BpmProcess:
    if example == EXTENSION_EXAMPLE:
        return space.import_example(fake_extension.drawing(space.root.parent / "src"), example)
    return space.import_example(EXAMPLES, example)


@pytest.fixture(autouse=True)
def _app() -> Any:
    from PySide6.QtWidgets import QApplication

    yield QApplication.instance() or QApplication([])


# ─────────────────────────── 담는 것 (Qt 없음) ───────────────────────────


def test_learning_says_nothing_when_there_is_no_memory(space: Workspace) -> None:
    """**빈 상자를 말없이 두지 않는다** — 없으면 어떻게 생기는지 말한다 (ADR-0028)."""
    assert learning(imported(space)) == module.NO_MEMORY


def test_the_server_warning_counts_and_stays_quiet_when_clean() -> None:
    assert server_warning([]) == ""
    found = server_warning(["Task_a: AI 태스크 domain=desktop", "Task_b: AI 태스크 domain=web"])
    assert "2개" in found and "실행 전 검사" in found


def test_the_window_and_the_check_count_the_same_things(space: Workspace) -> None:
    """**검사와 같은 함수**다 (`server_blockers`) — 어긋나면 한쪽이 거짓말을 한다."""
    process = imported(space)
    entry = process.entry_definition
    assert entry is not None and entry.process is not None

    window = dialog(space, process)
    assert window.blockers() == server_blockers(entry.process)
    found = [v for v in validate_bpmn(entry.process) if v.rule == "B6"]
    assert bool(found) is bool(window.blockers())


def test_the_check_says_the_first_problem_only() -> None:
    assert check(name="이름", version="1.0.0", taken={}) == ""
    assert "이름을 적으세요" in check(name="  ", version="1.0.0", taken={})
    assert "a.other" in check(name="겹침", version="1.0.0", taken={"겹침": "a.other"})
    assert "버전은" in check(name="이름", version="1.0", taken={})


def test_a_name_already_shared_does_not_block_other_edits() -> None:
    """복사해 만든 BPM 프로세스는 이름이 겹친 채 있다 — 버전만 올리는 것을 막지 않는다."""
    assert check(name="겹침", version="1.0.1", taken={"겹침": "a.other"}, was="겹침") == ""
    assert "같은 이름" in check(name="겹침", version="1.0.1", taken={"겹침": "a.other"}, was="옛 이름")


# ─────────────────────────── 창 ───────────────────────────


def dialog(
    space: Workspace,
    process: BpmProcess,
    *,
    editable: bool = True,
    task_type_locations: dict[str, list[str]] | None = None,
) -> ProcessInfoDialog:
    return ProcessInfoDialog(
        process,
        space,
        editable=editable,
    )


def test_the_record_fields_save_to_the_workspace(space: Workspace) -> None:
    """기록은 창이 쓴다 — `process.json`은 **Studio 안에서만 쓰는 기록**이라 계약이 아니다."""
    process = imported(space)
    window = dialog(space, process)
    window.name_box.setText("대량 신용 조회")
    window.version_box.setText("2.1.0")
    window.description_box.setPlainText("월말에 거래처 신용을 모아 조회한다.")
    window.owner_box.setText("재무팀 김")
    window.tags_box.setText(" 재무 , 월말 ,, ")
    window.save()

    assert window.saved is not None
    assert window.saved.tags == ("재무", "월말"), "빈 조각은 버린다"
    found = read_record(process.folder)
    assert found["name"] == "대량 신용 조회" and found["version"] == "2.1.0"
    assert found["owner"] == "재무팀 김"
    assert found["tags"] == ["재무", "월말"]


def test_an_empty_field_is_not_written(space: Workspace) -> None:
    """**「아직 안 적었다」와 「비웠다」를 가르지 않는다** — 빈 값은 기록에 넣지 않는다."""
    window = dialog(space, imported(space))
    window.save()
    found = read_record(window.saved.folder)  # type: ignore[union-attr]
    assert "description" not in found and "owner" not in found and "tags" not in found


def test_the_description_goes_into_the_package(space: Workspace) -> None:
    """설명만 패키지로 간다 (C1 `description`) — 담당자·태그는 매니페스트에 칸이 없다."""
    process = imported(space)
    window = dialog(space, process)
    window.description_box.setPlainText("월말 신용 조회")
    window.save()
    assert window.saved is not None
    assert build_manifest(window.saved).description == "월말 신용 조회"
    # 비우면 **넣지 않는다** — 빈 글을 적으면 콘솔이 「설명이 있다」로 읽는다.
    assert build_manifest(process).description is None


def test_a_bad_value_keeps_the_window_open(space: Workspace) -> None:
    window = dialog(space, imported(space))
    window.version_box.setText("버전")
    window.save()
    assert window.saved is None
    assert window.result() != ProcessInfoDialog.DialogCode.Accepted
    assert "버전은" in window.note.text()


def test_the_note_says_why_the_graph_is_not_read(space: Workspace) -> None:
    """진입이 열려 있지 않으면 까닭을 적는다 (U3) — 기록은 그래도 저장된다."""
    process = imported(space)
    window = dialog(space, process, editable=False)
    entry = process.entry_definition
    assert entry is not None
    assert entry.path.name in window.note.text()

    window.name_box.setText("이름만 바꾼다")
    window.save()
    assert window.saved is not None, "기록은 그래도 저장된다"


# ─────────────────────────── 「서비스 앱 키」 섹션은 없다 (ADR-0102) ───────────────────────────


def test_the_button_is_apply(space: Workspace) -> None:
    from PySide6.QtWidgets import QDialogButtonBox

    window = dialog(space, imported(space))
    apply = window.buttons.button(QDialogButtonBox.StandardButton.Ok)
    assert apply is not None and apply.text() == "적용"
    assert window.buttons.button(QDialogButtonBox.StandardButton.Save) is None
    assert not hasattr(window, "apply_note")
