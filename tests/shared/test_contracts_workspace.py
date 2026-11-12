"""C17 (작업공간) 모델과 경로 규칙.

**받는 쪽이 경로를 믿지 않는다** — 그 판정이 계약에 있으니(`check_file_path`) 여기가 그것을
지킨다. 결정의 까닭은 [ADR-0143](../../docs/decisions/0143-design-happens-in-the-console.md)와
[ADR-0146](../../docs/decisions/0146-design-work-has-its-own-lane.md)에 있다.
"""

from __future__ import annotations

import pytest

from bpm.contracts import (
    KNOWN_TEST_VERDICTS,
    PROCESS_JSON,
    TEST_RUN_PREFIX,
    VERDICT_PASS,
    BuildRequest,
    TrialCreateRequest,
    TrialInfo,
    WorkspaceCreateRequest,
    check_file_path,
)

AT = "2026-11-13T09:00:00+09:00"


# ─────────────────────────── 경로 규칙 ───────────────────────────


@pytest.mark.parametrize(
    "path",
    [
        PROCESS_JSON,
        "process/main.bpmn",
        "process/승인.bpmn",
        "process/rules/limits.dmn",
        "cases/main.cases.json",
        "memory/specs.json",
    ],
)
def test_the_paths_a_workspace_really_has(path: str) -> None:
    assert check_file_path(path) is None, path


@pytest.mark.parametrize(
    ("path", "about"),
    [
        ("", "비었거나"),
        (" process/main.bpmn", "빈칸"),
        ("/etc/passwd", "절대 경로"),
        ("C:/windows/win.ini", "드라이브"),
        ("process/../../etc/passwd", "`..`"),
        ("process//main.bpmn", "빈 칸"),
        ("process\\main.bpmn", "`/`로 가른다"),
        ("process/main.txt", "로 끝나야"),
        ("cases/main.json", "로 끝나야"),
        ("memory/other.json", "로 끝나야"),
        ("runs/run_1.jsonl", "첫 칸은"),
        ("README.md", "뿌리에 둘 수 있는"),
        ("libs/erp.shared@1.2.0/process/main.bpmn", "설치로 바꾼다"),
    ],
)
def test_the_paths_a_receiver_must_refuse(path: str, about: str) -> None:
    """하나라도 지나가면 422 `bad_path`가 아니라 **파일 시스템이 막는 일**이 된다."""
    reason = check_file_path(path)
    assert reason is not None, path
    assert about in reason, (path, reason)


def test_libs_is_read_only_not_unknown() -> None:
    """`libs/`는 **모르는 자리가 아니라 고칠 수 없는 자리**다 — 사유가 사람에게 길을 알려 준다."""
    reason = check_file_path("libs/a.shared@1.0.0/process/main.bpmn")
    assert reason is not None
    assert "설치" in reason


# ─────────────────────────── 모델 ───────────────────────────


def test_a_workspace_id_follows_the_manifest_rule() -> None:
    """배포 후보를 지을 때 **그대로 C1 `id`가 된다** — 여기서 느슨하면 짓다가 R1로 막힌다."""
    with pytest.raises(ValueError, match="id"):
        WorkspaceCreateRequest(schema=1, id="Finance.Invoice", name="청구")


def test_a_new_workspace_has_no_company_of_its_own() -> None:
    """비우면 **부르는 계정의 회사**다 (C16) — 지어내지 않는다."""
    made = WorkspaceCreateRequest(schema=1, id="finance.invoice", name="청구")
    assert made.company is None
    assert made.version == "0.1.0"


def test_a_test_run_defaults_to_autonomous() -> None:
    """Studio 개발 실행이 그랬다 (CLAUDE.md §1) — 운영 실행만 결정 수행이다."""
    assert TrialCreateRequest(schema=1).mode == "autonomous"
    assert TrialCreateRequest(schema=1).case is None, "케이스를 비우면 비교하지 않는다"


def test_a_running_test_has_no_verdict_yet() -> None:
    """도는 중에 `통과`를 넣으면 화면이 **끝난 줄로 읽는다**."""
    info = TrialInfo(run_id="test_1", workspace_id="finance.invoice", state="running")
    assert info.verdict is None
    assert info.learned == 0


def test_the_verdicts_are_the_ones_the_engine_uses() -> None:
    """**판정 글의 자리는 하나다** — 두 벌을 두면 콘솔이 「통과」를 모르는 글자로 받는다."""
    from bpm.core.testrun.runner import ERROR, FAIL, NO_EXPECT, PASS, STOPPED

    assert {PASS, FAIL, NO_EXPECT, STOPPED, ERROR} == KNOWN_TEST_VERDICTS
    assert PASS == VERDICT_PASS


def test_a_test_run_id_says_it_is_a_test() -> None:
    """자리 셈이 이 앞자리로 운영과 시험을 가른다 (ADR-0146)."""
    assert TEST_RUN_PREFIX == "test_"


def test_building_defaults_to_a_bpm_process() -> None:
    assert BuildRequest(schema=1).kind == "bpm_process"
