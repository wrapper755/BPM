"""엔진이 확장 태스크를 수행한다 (`bpm:task`, C13·ADR-0018, M4 조각 14).

**엔진은 확장을 모른다** — 태스크 종류 이름으로 수행기를 찾아 넘기고 출력만 받는다.
그래서 여기 시험도 가짜 확장 하나로 돈다 (UI 자동화를 들이지 않는다).

거듭 보는 것 여섯.

1. **출력은 변수로** 들어간다.
2. 업무 실패는 **오류 경계가 받는다** — 확장의 `TaskFailed`를 엔진의 것으로 옮긴다.
3. 확장이 없으면 **그림·설치 오류**다 (경계로 받지 않는다) — 재시도로 풀리지 않는다.
4. 수행기가 받는 것은 C14 속성과 **키 참조 이름**이다 (값이 아니다, ADR-0013).
5. **값은 기록에 남지 않는다** (원칙 6).
6. 확장이 남기고 싶다고 한 줄은 **엔진이 쓴다** (C3, ADR-0041) — 칸을 붙이고, 거르고,
   어긋난 줄만 버린다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from bpm.contracts.bpmn_ext import read_process
from bpm.core.engine import Engine, RunEnv, State
from bpm.core.run_log import RunLog
from bpm.extension_api import ExtensionEvent, TaskContext, TaskFailed, TaskOutcome, review_table

RUN = "run_20261005_120000_abcdef"

PROCESS = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1"
                  targetNamespace="urn:chaeksas:example">
  <bpmn:process id="Proc_ext" name="확장 태스크" isExecutable="true">
    <bpmn:extensionElements>
      <bpm:process>{"service_keys": {"demo": "demo-key"}}</bpm:process>
    </bpmn:extensionElements>
    <bpmn:startEvent id="Start" />
    <bpmn:serviceTask id="Task_Ext" name="확장 태스크">
      <bpmn:extensionElements>
        <bpm:task type="demo_task" extension="demo">{"page_id": "p", "steps": []}</bpm:task>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:endEvent id="End" />
    <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Task_Ext" />
    <bpmn:sequenceFlow id="f2" sourceRef="Task_Ext" targetRef="End" />
  </bpmn:process>
</bpmn:definitions>
"""

#: 오류 경계가 붙은 같은 그림 — 업무 실패가 **경계로 간다**는 것을 보려고.
WITH_BOUNDARY = PROCESS.replace(
    "<bpmn:endEvent id=\"End\" />",
    """<bpmn:endEvent id="End" />
    <bpmn:boundaryEvent id="Boundary" attachedToRef="Task_Ext">
      <bpmn:errorEventDefinition id="err" />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="End_error" />
    <bpmn:sequenceFlow id="f3" sourceRef="Boundary" targetRef="End_error" />""",
)


class FakeExecutor:
    """`extension_api.TaskExecutor` — 받은 것을 남기고 정해진 답을 준다."""

    def __init__(
        self,
        *,
        outputs: dict[str, Any] | None = None,
        fail: Exception | None = None,
        events: list[ExtensionEvent] | None = None,
    ) -> None:
        self.outputs = outputs or {}
        self.fail = fail
        self.events = events or []
        self.seen: list[TaskContext] = []

    def execute(self, ctx: TaskContext) -> TaskOutcome:
        self.seen.append(ctx)
        if self.fail is not None:
            raise self.fail
        return TaskOutcome(outputs=self.outputs, events=self.events)


class Host:
    """`core.run_state.ExtensionTasks` — 태스크 종류로 수행기를 찾아 준다."""

    def __init__(self, executors: dict[str, Any]) -> None:
        self.executors = executors

    def executor(self, task_type: str) -> Any | None:
        return self.executors.get(task_type)


def run_it(tmp_path: Path, xml: str, host: Any, **variables: Any) -> Any:
    engine = Engine()
    process = read_process(xml)
    run = engine.start(
        process,
        run_id=RUN,
        log=RunLog(run_id=RUN, path=tmp_path / "run.jsonl"),
        env=RunEnv(extensions=host),
        inputs=variables,
    )
    for _ in range(50):
        if run.state in (State.DONE, State.FAILED) or engine.blocked(run):
            break
        engine.step(run)
    return run


def events(tmp_path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in (tmp_path / "run.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


# ─────────────────────────── 수행 ───────────────────────────


def test_defaults_web_and_desktop_reach_the_task_and_the_task_wins(tmp_path: Path) -> None:
    """`bpm:defaults`의 `web`·`desktop`은 확장 태스크 속성의 기본값이다 — **태스크에 적은 값이 이긴다**
    (C14, ADR-0033). UI 태스크가 띄울 앱 이름을 이렇게 받는다."""
    with_defaults = PROCESS.replace(
        '<bpm:process>{"service_keys": {"demo": "demo-key"}}</bpm:process>',
        '<bpm:process>{"service_keys": {"demo": "demo-key"}}</bpm:process>'
        '<bpm:defaults>{"desktop": {"app": "ERP Client"}, "web": {"profile": "업무"}}</bpm:defaults>',
    ).replace('{"page_id": "p", "steps": []}', '{"page_id": "p", "steps": [], "web": {"profile": "태스크"}}')
    executor = FakeExecutor()
    run = run_it(tmp_path, with_defaults, Host({"demo_task": executor}))
    assert run.state == State.DONE
    seen = executor.seen[0].properties
    assert seen["desktop"] == {"app": "ERP Client"}
    assert seen["web"] == {"profile": "태스크"}
    assert seen["page_id"] == "p"


def test_the_outputs_become_variables(tmp_path: Path) -> None:
    executor = FakeExecutor(outputs={"제출메시지": "접수되었습니다", "번호": 7})
    run = run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    assert run.state == State.DONE
    assert run.variables["제출메시지"] == "접수되었습니다"
    assert run.variables["번호"] == 7


def test_the_executor_sees_the_contract_shape(tmp_path: Path) -> None:
    """C14 속성과 **이 실행의 BPM 프로세스·판**이 간다 — 확장이 외부 작업을 올릴 때 Center가 대조한다 (C15)."""
    executor = FakeExecutor()
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    seen = executor.seen[0]
    assert seen.properties == {"page_id": "p", "steps": []}
    assert seen.run_id == RUN and seen.node_id == "Task_Ext"
    assert seen.business_key == f"{RUN}:Task_Ext:1:1", "C10 세션을 잇는 키다"
    assert seen.key_ref is None, "서비스 앱 키가 없어졌다 (ADR-0102)"
    assert seen.bpm_process_id, "그 실행의 BPM 프로세스(패키지 id)가 간다"
    assert seen.mode == "autonomous" or seen.mode == "deterministic"


def test_the_task_properties_are_not_the_values(tmp_path: Path) -> None:
    """**비밀은 가지 않는다** — 참조 이름뿐이다."""
    executor = FakeExecutor()
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    assert "key_ref" in executor.seen[0].__dict__ or executor.seen[0].key_ref
    assert "bpm_svc_" not in json.dumps(executor.seen[0].properties, ensure_ascii=False)


# ─────────────────────────── 실패 ───────────────────────────


def test_a_business_failure_goes_to_the_error_boundary(tmp_path: Path) -> None:
    """확장의 `TaskFailed`를 **엔진의 것으로 옮긴다** — 그대로 두면 경계가 못 받는다."""
    executor = FakeExecutor(fail=TaskFailed("screen_changed", "화면이 바뀌었습니다"))
    run = run_it(tmp_path, WITH_BOUNDARY, Host({"demo_task": executor}))
    assert run.state == State.DONE, "경계가 받아 다른 길로 끝났다"
    assert run.variables.get("error_code") == "screen_changed"


def escalating() -> FakeExecutor:
    return FakeExecutor(
        outputs={"읽은값": "버려진다"},
        fail=TaskFailed("ui_escalated", "화면을 확인해 주세요", escalate="confirmation"),
    )


#: 서버 실행 — 확인에 답할 사람이 없다 (C1 R2).
ON_SERVER = WITH_BOUNDARY.replace('"run_location": "pc"', '"run_location": "server"')

#: `ESCALATED`를 **이름으로** 받는 경계 — 흐름으로 받겠다고 적은 그림 (ADR-0106 §2).
NAMED_ESCALATED = WITH_BOUNDARY.replace(
    '<bpmn:process id="Proc_ext"',
    '<bpmn:error id="Err_Esc" name="ESCALATED" errorCode="ESCALATED" />\n  <bpmn:process id="Proc_ext"',
).replace('<bpmn:errorEventDefinition id="err" />', '<bpmn:errorEventDefinition id="err" errorRef="Err_Esc" />')


def test_an_escalation_reaches_the_escalated_boundary(tmp_path: Path) -> None:
    """확장의 **전환**(`escalate: confirmation`)은 `ESCALATED`다 — C14의 경계가 그 코드로 받는다
    (ADR-0105). 확장이 준 코드(`ui_escalated`)를 그대로 올리면 `ESCALATED` 경계가 받지 못한다.
    **사람에게 묻지 않는다** — 그 갈래는 PC 실행기와 함께 걷었다 (ADR-0144).
    """
    run = run_it(tmp_path, ON_SERVER, Host({"demo_task": escalating()}))
    assert run.state == State.DONE
    assert run.variables.get("error_code") == "ESCALATED"
    assert not run.pendings


def test_a_named_escalated_boundary_takes_it_too(tmp_path: Path) -> None:
    """그림이 `ESCALATED`를 **이름으로** 받아도 같다."""
    run = run_it(tmp_path, NAMED_ESCALATED, Host({"demo_task": escalating()}))
    assert run.state == State.DONE and not run.pendings
    assert run.variables.get("error_code") == "ESCALATED"


#: 확장이 사람에게 보이라고 준 검토 자료 (ADR-0112) — 표 하나와 글 하나.
SHOWN = {
    "요소": "주문.저장",
    "시도한 로케이터": review_table(
        ["순서", "종류", "결과"], [[1, "role", "찾지 못함"], [2, "css", "여러 개 맞음 (2)"]]
    ),
}


def reviewing() -> FakeExecutor:
    return FakeExecutor(
        fail=TaskFailed("ui_escalated", "화면을 확인해 주세요", escalate="confirmation", review=SHOWN),
    )


@pytest.mark.parametrize("xml", [ON_SERVER, NAMED_ESCALATED], ids=["server", "named-boundary"])
def test_the_review_is_dropped_when_the_boundary_takes_it(tmp_path: Path, xml: str) -> None:
    """오류 경계로 가면 보일 사람이 없다 — 검토 자료는 **어디에도 가지 않는다** (ADR-0112 §4)."""
    run = run_it(tmp_path, xml, Host({"demo_task": reviewing()}))
    assert run.state == State.DONE and not run.pendings
    assert "주문.저장" not in json.dumps(events(tmp_path), ensure_ascii=False)
    assert "주문.저장" not in json.dumps(run.variables, ensure_ascii=False, default=str)


@pytest.mark.parametrize(("xml", "state"), [(PROCESS, State.FAILED), (WITH_BOUNDARY, State.DONE)])
def test_an_escalation_is_a_business_failure(tmp_path: Path, xml: str, state: State) -> None:
    """전환은 `ESCALATED` 업무 실패다 — 코드 없는 경계가 받고, 없으면 실행이 실패로 끝난다."""
    engine = Engine()
    run = engine.start(
        read_process(xml), run_id=RUN, log=RunLog(run_id=RUN, path=tmp_path / "run.jsonl"),
        env=RunEnv(extensions=Host({"demo_task": escalating()})),
    )
    assert engine.run_until_blocked(run) is state
    assert not run.pendings, "묻지 않는다 (ADR-0144)"
    if state is State.DONE:
        assert run.variables["error_code"] == "ESCALATED"
        assert "화면을 확인해 주세요" in run.variables["error_message"]
    else:
        assert run.error is not None and run.error.code == "ESCALATED"


def test_a_missing_extension_is_a_setup_error(tmp_path: Path) -> None:
    """**경계로 받지 않는다** — 그 PC에 확장이 없는 것이고 재시도로 풀리지 않는다."""
    run = run_it(tmp_path, WITH_BOUNDARY, Host({}))
    assert run.state == State.FAILED
    finished = [one for one in events(tmp_path) if one["kind"] == "run_finished"]
    assert finished and finished[-1]["data"]["status"] == "failed"
    node = [one for one in events(tmp_path) if one["kind"] == "node_state"][-1]
    assert node["data"]["error_code"] == "node_kind_unsupported", "경계가 받을 실패가 아니다"


def test_the_default_env_cannot_run_extension_tasks(tmp_path: Path) -> None:
    """기본값은 **아무 확장도 없다** — 조용히 넘어가지 않는다 (RunEnv의 규칙)."""
    engine = Engine()
    run = engine.start(
        read_process(PROCESS), run_id=RUN, log=RunLog(run_id=RUN, path=tmp_path / "run.jsonl")
    )
    for _ in range(10):
        if run.state in (State.DONE, State.FAILED):
            break
        engine.step(run)
    assert run.state == State.FAILED


# ─────────────────────────── 기록 (원칙 6) ───────────────────────────


def test_the_values_do_not_reach_the_log(tmp_path: Path) -> None:
    executor = FakeExecutor(outputs={"연락처": "010-1234-5678"})
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    raw = (tmp_path / "run.jsonl").read_text(encoding="utf-8")
    assert "010-1234-5678" not in raw, "업무 값은 기록에 남지 않는다 (원칙 6)"
    assert "demo_task" in raw, "무엇을 했는지는 남는다"


# ──────────────── 확장이 남기는 실행 기록 (C3, ADR-0041) ────────────────


def ocr_page(**extra: Any) -> dict[str, Any]:
    """확장이 남기는 줄 하나의 `data` — C3가 모르는 종류(`ocr_page`)라 필수 키를 묻지 않는다."""
    return {
        "business_key": f"{RUN}:Task_Ext:1:1",
        "page_id": "erp.order.form",
        "result": "success",
        "steps": 6,
        "fallback_depth_max": 1,
        "healed": False,
        **extra,
    }


def kinds(tmp_path: Path) -> list[str]:
    return [one["kind"] for one in events(tmp_path)]


def test_the_engine_writes_the_line_and_adds_its_own_fields(tmp_path: Path) -> None:
    """확장은 `{kind, data}`만 준다 — `run_id`·`seq`·`ts`·`node_id`는 **엔진이 붙인다**."""
    executor = FakeExecutor(events=[ExtensionEvent(kind="ocr_page", data=ocr_page())])
    run = run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    assert run.state == State.DONE
    line = [one for one in events(tmp_path) if one["kind"] == "ocr_page"]
    assert len(line) == 1
    assert line[0]["run_id"] == RUN
    assert line[0]["node_id"] == "Task_Ext", "어느 노드였나는 엔진만 안다"
    assert line[0]["seq"] >= 1 and line[0]["ts"], "번호와 시각도 엔진이 붙인다"
    assert line[0]["data"]["page_id"] == "erp.order.form", "확장이 준 내용은 그대로 간다"


def test_the_engine_filters_what_the_extension_gave(tmp_path: Path) -> None:
    """**확장을 믿고 통과시키지 않는다** — `sanitize()`를 그대로 거친다 (원칙 6).

    거르는 자리가 하나여야 지켜진다. 확장이 실수로 업무 값을 실어도 파일에 남지 않는다.
    """
    executor = FakeExecutor(
        events=[
            ExtensionEvent(
                kind="ocr_page",
                data=ocr_page(읽은값={"고객명": "홍길동"}, 메모="적어 둔 말 " * 60),
            )
        ]
    )
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    raw = (tmp_path / "run.jsonl").read_text(encoding="utf-8")
    line = [one for one in events(tmp_path) if one["kind"] == "ocr_page"][0]
    assert line["data"]["읽은값"] == {"개수": 1}, "사전은 개수만 남는다"
    assert len(line["data"]["메모"]) <= 201, "긴 글은 잘린다"
    assert "홍길동" not in raw, "사전 안의 값은 아예 나가지 않는다"


def test_the_extension_cannot_set_the_engines_fields(tmp_path: Path) -> None:
    """확장이 `data`에 `seq`·`run_id`를 적어 보내도 **우리 것이 이긴다** — 두 수가 어긋나면
    그 실행의 기록이 영원히 막힌다 (C3 멱등은 `(run_id, seq)`다)."""
    executor = FakeExecutor(
        events=[
            ExtensionEvent(
                kind="ocr_page", data=ocr_page(seq=999, run_id="run_20200101_000000_ffffff")
            )
        ]
    )
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    line = [one for one in events(tmp_path) if one["kind"] == "ocr_page"][0]
    assert line["run_id"] == RUN
    assert line["seq"] != 999 and "seq" not in line["data"]


def test_a_line_missing_a_required_key_is_dropped_and_the_run_goes_on(tmp_path: Path) -> None:
    """알려진 `kind`인데 필수 키가 빠지면 **그 줄만 버린다** — 업무 실패가 아니다.
    기록 한 줄 때문에 다 된 업무를 깨지 않는다 (C3 「받는 쪽은 관대하게」)."""
    broken = {"model": "m", "input_tokens": 1}  # C3 `llm_usage`의 `output_tokens`가 빠졌다
    executor = FakeExecutor(events=[ExtensionEvent(kind="llm_usage", data=broken)])
    run = run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    assert run.state == State.DONE, "실행은 이어 간다"
    assert "llm_usage" not in kinds(tmp_path)
    warned = [
        one for one in events(tmp_path)
        if one["kind"] == "log" and one["data"]["level"] == "warn" and "output_tokens" in one["data"]["message"]
    ]
    assert warned, "왜 버렸는지는 남는다"


def test_an_unknown_kind_is_written_as_is(tmp_path: Path) -> None:
    """`kind`는 **열린 문자열**이다 (C3) — 엔진이 종류를 제한하지 않는다."""
    executor = FakeExecutor(events=[ExtensionEvent(kind="demo_thing", data={"무엇": 3})])
    run_it(tmp_path, PROCESS, Host({"demo_task": executor}))
    line = [one for one in events(tmp_path) if one["kind"] == "demo_thing"]
    assert line and line[0]["data"] == {"무엇": 3}


def test_a_failed_task_still_leaves_its_line(tmp_path: Path) -> None:
    """**실패한 태스크도 남긴다** — 전환으로 끝난 UI 태스크가 CON-01에서 가장 보고 싶은 줄이다."""
    executor = FakeExecutor(
        fail=TaskFailed(
            "ui_escalated",
            "화면을 확인해 주세요",
            events=[ExtensionEvent(kind="ocr_page", data=ocr_page(result="escalated"))],
        )
    )
    run = run_it(tmp_path, WITH_BOUNDARY, Host({"demo_task": executor}))
    assert run.state == State.DONE, "경계가 받아 다른 길로 끝났다"
    line = [one for one in events(tmp_path) if one["kind"] == "ocr_page"]
    assert line and line[0]["data"]["result"] == "escalated"


@pytest.mark.parametrize("mode", ["autonomous", "deterministic"])
def test_both_modes_reach_the_executor(tmp_path: Path, mode: str) -> None:
    """**모드를 바꾸지 않는다** (계약 원칙 7) — 받은 그대로 넘긴다."""
    executor = FakeExecutor()
    engine = Engine()
    run = engine.start(
        read_process(PROCESS),
        run_id=RUN,
        log=RunLog(run_id=RUN, path=tmp_path / "run.jsonl"),
        env=RunEnv(extensions=Host({"demo_task": executor})),
        mode=mode,
    )
    for _ in range(10):
        if run.state in (State.DONE, State.FAILED):
            break
        engine.step(run)
    assert executor.seen[0].mode == mode
