"""보상 (C14 §보상, ADR-0135) — 끝난 활동을 끝난 순서의 거꾸로 되돌린다.

| 무엇을 | 왜 |
| --- | --- |
| RPA가 실패 → 오류 경계 → 보상 종료가 앞선 AI·API를 거꾸로 되돌린다 | 참고 문서 5장의 「트랜잭션 보상」 그림 그대로 |
| 끝나지 않은 활동·보상 경계 없는 활동은 되돌리지 않는다 | 하지 않은 일을 취소하면 다른 일이 사라진다 |
| `activityRef`면 그것만, 한 번 되돌린 것은 다시 되돌리지 않는다 | 던지기가 둘이어도 업무가 두 번 취소되지 않게 |
| 처리기가 기다려도(결재) 담았다 되살리면 이어 간다 | 서버 실행기는 기다리는 실행을 담아 둔다 (ADR-0054) |
| B17 — 처리기에 흐름, 연관 없는 경계, 남의 범위 `activityRef` | 그림이 잘못되면 실행 전에 말한다 |
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bpm.contracts.bpmn_ext import read_process, validate
from bpm.core.engine import Engine, Run, RunEnv, State
from bpm.core.run_log import RunLog
from bpm.core.run_snapshot import dump, restore
from bpm.core.services import OpCall, OpOutcome, ServiceCallError

NOW = datetime(2026, 11, 8, 9, 0, tzinfo=UTC)
RUN_ID = "run_20261108_090000_abc123"

SHELL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1" id="Defs">
  <bpmn:process id="test.comp" name="시험">
    <bpmn:extensionElements><bpm:process>{{"run_location": "server"}}</bpm:process></bpmn:extensionElements>
    {body}
  </bpmn:process>
</bpmn:definitions>
"""


def flow(id_: str, source: str, target: str) -> str:
    return f'<bpmn:sequenceFlow id="{id_}" sourceRef="{source}" targetRef="{target}"/>'


def script(id_: str, body: str, *, handler: bool = False) -> str:
    mark = ' isForCompensation="true"' if handler else ""
    return (
        f'<bpmn:scriptTask id="{id_}" scriptFormat="bpm-expr"{mark}>'
        f"<bpmn:script>{body}</bpmn:script></bpmn:scriptTask>"
    )


def call(id_: str, app: str) -> str:
    return (
        f'<bpmn:serviceTask id="{id_}"><bpmn:extensionElements><bpm:serviceCall>'
        f'{{"app_id": "{app}", "operation": "go", "input": {{}}, "output": {{}}}}'
        "</bpm:serviceCall></bpmn:extensionElements></bpmn:serviceTask>"
    )


def undo(activity: str, handler_body: str) -> str:
    """활동 하나에 보상 경계 + 연관 + 보상 처리기(스크립트)."""
    return (
        f'<bpmn:boundaryEvent id="Comp_{activity}" attachedToRef="{activity}">'
        "<bpmn:compensateEventDefinition/></bpmn:boundaryEvent>"
        + script(f"Undo_{activity}", handler_body, handler=True)
        + f'<bpmn:association id="As_{activity}" sourceRef="Comp_{activity}" targetRef="Undo_{activity}"/>'
    )


@dataclass
class Apps:
    """`rpa` 앱만 실패한다 — 나머지는 끝낸다."""

    failing: frozenset[str] = frozenset({"rpa"})
    calls: list[str] = field(default_factory=list)

    def call(self, request: OpCall) -> OpOutcome:
        self.calls.append(request.app_id)
        if request.app_id in self.failing:
            raise ServiceCallError("화면에서 주문 번호 칸을 찾지 못했다", code="operation_failed")
        return OpOutcome(output={}, mode_used=request.mode, duration_ms=0)


HYBRID = (
    '<bpmn:startEvent id="Start"/>'
    + script("Init", "취소 = []")
    + call("Task_AI", "ai")
    + call("Task_API", "api")
    + call("Task_RPA", "rpa")
    + '<bpmn:endEvent id="End_Ok"/>'
    + undo("Task_AI", "취소 = 취소 + ['AI']")
    + undo("Task_API", "취소 = 취소 + ['API']")
    + undo("Task_RPA", "취소 = 취소 + ['RPA']")
    + '<bpmn:boundaryEvent id="Err_RPA" attachedToRef="Task_RPA"><bpmn:errorEventDefinition/></bpmn:boundaryEvent>'
    + '<bpmn:endEvent id="End_Undo"><bpmn:compensateEventDefinition/></bpmn:endEvent>'
    + flow("f1", "Start", "Init")
    + flow("f2", "Init", "Task_AI")
    + flow("f3", "Task_AI", "Task_API")
    + flow("f4", "Task_API", "Task_RPA")
    + flow("f5", "Task_RPA", "End_Ok")
    + flow("f6", "Err_RPA", "End_Undo")
)


def start(body: str, apps: Apps | None = None) -> tuple[Engine, Run]:
    engine = Engine()
    process = read_process(SHELL.format(body=body))
    run = engine.start(
        process, run_id=RUN_ID, log=RunLog(run_id=RUN_ID), now=NOW, env=RunEnv(services=apps or Apps())
    )
    return engine, run


def logs(run: Run) -> list[str]:
    return [str(e.data.get("message")) for e in run.log.events if e.kind == "log"]


def test_a_failed_rpa_step_undoes_the_earlier_steps_in_reverse() -> None:
    engine, run = start(HYBRID)
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["취소"] == ["API", "AI"], "끝난 순서의 거꾸로 — 실패한 RPA는 끝나지 않았다"
    assert "보상했다: Task_API (처리기 Undo_Task_API)" in logs(run)
    assert [c.node_id for c in run.compensable if c.compensated] == ["Task_AI", "Task_API"]


def test_when_everything_succeeds_nothing_is_undone() -> None:
    engine, run = start(HYBRID, Apps(failing=frozenset()))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["취소"] == []
    assert not any((e.node_id or "").startswith("Undo_") for e in run.log.events if e.kind == "node_state")


def test_the_throw_event_starts_once() -> None:
    """처리기를 돌고 돌아온 것은 두 번째 시작이 아니다 (종료 이벤트는 원래 「완료」를 남기지 않는다)."""
    engine, run = start(HYBRID)
    engine.run_until_blocked(run)
    states = [e.data["state"] for e in run.log.events if e.kind == "node_state" and e.node_id == "End_Undo"]
    assert states == ["started"]


INTERMEDIATE = (
    '<bpmn:startEvent id="Start"/>'
    + script("Init", "취소 = []")
    + script("Task_A", "a = 1")
    + script("Task_B", "b = 1")
    + script("Task_C", "c = 1")
    + undo("Task_A", "취소 = 취소 + ['A']")
    + undo("Task_B", "취소 = 취소 + ['B']")
    + '<bpmn:intermediateThrowEvent id="Throw_B"><bpmn:compensateEventDefinition activityRef="Task_B"/>'
    "</bpmn:intermediateThrowEvent>"
    + '<bpmn:intermediateThrowEvent id="Throw_All"><bpmn:compensateEventDefinition/></bpmn:intermediateThrowEvent>'
    + script("After", "다음 = 1")
    + '<bpmn:endEvent id="End"/>'
    + flow("f1", "Start", "Init")
    + flow("f2", "Init", "Task_A")
    + flow("f3", "Task_A", "Task_B")
    + flow("f4", "Task_B", "Task_C")
    + flow("f5", "Task_C", "Throw_B")
    + flow("f6", "Throw_B", "Throw_All")
    + flow("f7", "Throw_All", "After")
    + flow("f8", "After", "End")
)


def test_activity_ref_undoes_only_that_one_and_nothing_is_undone_twice() -> None:
    engine, run = start(INTERMEDIATE)
    assert engine.run_until_blocked(run) is State.DONE
    # Throw_B가 B만, Throw_All이 남은 A만 — 보상 경계 없는 C는 되돌릴 것이 없다.
    assert run.variables["취소"] == ["B", "A"]
    assert run.variables["다음"] == 1, "중간 던지기는 보상 뒤 다음으로 간다"


def test_a_handler_that_waits_survives_a_snapshot() -> None:
    body = HYBRID.replace(
        script("Undo_Task_API", "취소 = 취소 + ['API']", handler=True),
        '<bpmn:userTask id="Undo_Task_API" isForCompensation="true"><bpmn:extensionElements>'
        '<bpm:approval>{"title": "API 취소 확인", "location": "center"}</bpm:approval>'
        "</bpmn:extensionElements></bpmn:userTask>",
    )
    engine, run = start(body)
    assert engine.run_until_blocked(run) is State.WAITING
    (pending,) = run.pendings.values()
    process = run.process

    revived = restore(dump(run), process=process, log=RunLog(run_id=RUN_ID), env=RunEnv(services=Apps()))
    engine.answer(revived, pending.request_id, {"decision": "approve"}, answered_by="담당")
    assert engine.run_until_blocked(revived) is State.DONE
    assert revived.variables["취소"] == ["AI"], "API는 결재로, AI는 스크립트로 되돌렸다"
    assert all(c.compensated for c in revived.compensable if c.node_id in ("Task_AI", "Task_API"))


# ─────────────────────────── B17 ───────────────────────────


def b17(body: str) -> list[str]:
    return [v.message for v in validate(read_process(SHELL.format(body=body))) if v.rule == "B17"]


def test_the_hybrid_picture_passes_the_checks() -> None:
    found = validate(read_process(SHELL.format(body=HYBRID)))
    assert [v.message for v in found if v.severity == "error"] == []


def test_b17_catches_a_handler_with_flows_and_a_boundary_without_a_link() -> None:
    bad = HYBRID.replace(
        '<bpmn:association id="As_Task_AI" sourceRef="Comp_Task_AI" targetRef="Undo_Task_AI"/>', ""
    ) + flow("f9", "Undo_Task_API", "End_Ok")
    found = b17(bad)
    assert any("Comp_Task_AI" in one and "연관이 하나" in one for one in found), found
    assert any("Undo_Task_API" in one and "흐름을" in one for one in found), found


def test_b17_catches_an_activity_ref_without_a_compensation_boundary() -> None:
    bad = INTERMEDIATE.replace('activityRef="Task_B"', 'activityRef="Task_C"')
    assert any("activityRef Task_C" in one for one in b17(bad))


def test_a_drawing_without_compensation_reads_as_before(tmp_path: Any) -> None:
    process = read_process(SHELL.format(body='<bpmn:startEvent id="S"/><bpmn:endEvent id="E"/>' + flow("f", "S", "E")))
    assert process.associations == [] and process.compensation_handler("S") is None
