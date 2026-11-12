"""STU-08 시험 실행 창 — 무엇을 고를 수 있고 무엇을 끄는가.

**돌리는 일은 `tests/shared/test_core_testrun.py`가 본다.** 여기 있는 것은 창의 판단뿐이다:
케이스 없이 돌릴 수 있나(필수 입력), 재생을 고를 수 있나(배운 것이 있나), 한 줄 설명.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from bpm.contracts.bpmn_ext import Case  # noqa: E402
from bpm.core.testrun.workspace import Workspace  # noqa: E402
from bpm.studio.run_dialog import AUTONOMOUS, describe, unlearned  # noqa: E402
from bpm.studio.settings import Settings  # noqa: E402

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "08-business-examples" / "bpmn"


@pytest.fixture(scope="session")
def app() -> Any:
    from PySide6.QtWidgets import QApplication

    try:
        return QApplication.instance() or QApplication([])
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"Qt를 띄울 수 없다: {type(e).__name__}: {e}")


def studio(tmp_path: Path, example: str) -> tuple[Any, Settings]:
    """예제 하나를 작업 폴더로 가져오고, 그 Studio 설정을 만든다."""
    from dataclasses import replace  # noqa: PLC0415

    data = tmp_path / "studio"
    settings = replace(Settings(), data_dir=data, llm_base_url="")
    made = Workspace(settings.workspace_dir).ensure().import_example(EXAMPLES, example)
    return made, settings


def test_the_run_dialog_stops_a_caseless_run_that_lacks_required_inputs(app: Any, tmp_path: Path) -> None:
    """STU-08 — 엔진이 거부할 실행을 보내지 않고 창에서 까닭을 말한다 (U3)."""
    from bpm.studio.run_dialog import NO_CASE, RunDialog, required_inputs  # noqa: PLC0415

    made, settings = studio(tmp_path, "fx06_document_read")
    definition = made.entry_definition
    assert definition is not None
    names = required_inputs(definition)
    assert names, "이 예제는 필수 입력이 있다"
    dialog = RunDialog(None, made, definition, settings)
    dialog.case_box.setCurrentIndex(dialog.case_box.findText(NO_CASE))
    assert not dialog.run_button.isEnabled()
    assert not dialog.needs_case.isHidden() and names[0] in dialog.needs_case.text()
    dialog.case_box.setCurrentIndex(1)  # 케이스를 고르면 다시 켜진다
    assert dialog.run_button.isEnabled() and dialog.needs_case.isHidden()


def test_a_caseless_run_without_required_inputs_is_allowed(app: Any, tmp_path: Path) -> None:
    from bpm.studio.run_dialog import NO_CASE, RunDialog  # noqa: PLC0415

    made, settings = studio(tmp_path, "fx12_daily_report")
    definition = made.entry_definition
    assert definition is not None
    dialog = RunDialog(None, made, definition, settings)
    dialog.case_box.setCurrentIndex(dialog.case_box.findText(NO_CASE))
    assert dialog.run_button.isEnabled() and dialog.needs_case.isHidden()



def test_the_run_dialog_turns_off_replay_when_nothing_was_learned(tmp_path: Path) -> None:
    """U3 — 고를 수 없는 것은 끄고 **이유**를 보인다."""
    made, _ = studio(tmp_path, "fx06_document_read")
    definition = made.entry_definition
    assert definition is not None
    assert unlearned(made, definition), "AI 태스크가 있고 명세가 없다"

    rules, _ = studio(tmp_path / "other", "fx02_business_rule")
    other = rules.entry_definition
    assert other is not None
    assert unlearned(rules, other) == [], "AI 태스크가 없으면 끌 이유도 없다"


def test_the_replay_menu_preselects_the_mode_only_when_it_can_be_chosen(
    tmp_path: Path, app: Any
) -> None:
    """실행 → 「결정 수행 (재생)...」(Ctrl+F5)은 STU-08을 그 모드로 열어 준다.

    **끈 라디오는 고르지 않는다** — 고르면 「실행」을 눌러도 어느 모드도 아니게 된다. 메뉴를
    끄지 않는 까닭이 여기 있다: 못 하는 사정은 창이 말한다 (U3).
    """
    from bpm.studio.run_dialog import DETERMINISTIC, RunDialog

    rules, settings = studio(tmp_path, "fx02_business_rule")  # AI 태스크가 없다 — 끌 이유가 없다
    definition = rules.entry_definition
    assert definition is not None
    chosen = RunDialog(None, rules, definition, settings, prefer=DETERMINISTIC)
    assert chosen.deterministic.isChecked() and not chosen.autonomous.isChecked()
    assert chosen.picked().mode == DETERMINISTIC

    unlearnt, settings = studio(tmp_path / "other", "fx06_document_read")  # 학습 안 된 AI 태스크
    other = unlearnt.entry_definition
    assert other is not None
    refused = RunDialog(None, unlearnt, other, settings, prefer=DETERMINISTIC)
    assert not refused.deterministic.isEnabled()
    assert refused.autonomous.isChecked(), "고를 수 없으면 자율 수행이 그대로 남는다"
    assert refused.picked().mode == AUTONOMOUS


def test_the_dialog_describes_the_case_in_one_line() -> None:
    assert describe(None) == "기대 결과를 비교하지 않습니다"
    assert describe(Case(name="x", inputs={"a": 1}, expected={})) == "입력 1개 · 기대 결과 없음 — 비교하지 않습니다"
    assert describe(Case(name="x", inputs={}, expected={"b": 1})) == "입력 0개 · 기대 결과 1개"
