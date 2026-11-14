"""서비스 호출의 결과 모름 → PC는 사람 확인 뒤 다시 부른다 (C15 `outcome_unknown`, C13 §4-1, ADR-0107).

| 보는 것 | 왜 |
| --- | --- |
| C15 결과의 `outcome_unknown`이 `ServiceCallError`까지 온다 | 부르는 쪽이 「거절」과 「답을 못 받았다」를 가른다 |
| PC 실행은 현장 확인 하나로 멈춘다 (ADR-0106과 같은 요청) | PC 실행기·CMN-01이 그대로 띄운다 |
| 「계속」은 `attempt`를 올려 같은 `call_seq`로 다시 부르고 출력이 채워진다 | 사람이 「처리되지 않았다」를 본 뒤다 |
| 「중단」은 `TASK_FAILED` — 서버와 같은 코드 | 그림의 경계를 바꾸지 않는다 |
| 서버·`TASK_FAILED`를 이름으로 받는 경계는 묻지 않는다 | 답할 사람이 없다 / 흐름으로 받겠다고 적었다 |
| 모름이 아닌 실패는 지금 그대로다 | 묻는 일은 모름일 때만이다 |
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest

from bpm.contracts.bpmn_ext import read_process
from bpm.core.engine import DECISION_KEY, Engine, Run, RunEnv, State
from bpm.core.run_log import RunLog
from bpm.core.services import OpCall, OpOutcome, ServiceCallError, _outcome

NOW = datetime(2026, 10, 29, 9, 30, tzinfo=UTC)
RUN_ID = "run_20261029_093000_abc123"

SHELL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1" id="Defs">
  {errors}
  <bpmn:process id="test.proc" name="시험">
    <bpmn:extensionElements><bpm:process>{{"run_location": "{where}"}}</bpm:process></bpmn:extensionElements>
    <bpmn:startEvent id="Start_1"/>
    <bpmn:serviceTask id="Task_Call" name="신용 조회"><bpmn:extensionElements><bpm:serviceCall>
      {{"app_id": "ext-credit", "operation": "check", "input": {{}}, "output": {{"등급": "grade"}}}}
    </bpm:serviceCall></bpmn:extensionElements></bpmn:serviceTask>
    <bpmn:endEvent id="End_1"/>
    <bpmn:sequenceFlow id="f1" sourceRef="Start_1" targetRef="Task_Call"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Task_Call" targetRef="End_1"/>
    <bpmn:boundaryEvent id="Bnd_Fail" attachedToRef="Task_Call">
      <bpmn:errorEventDefinition {error_ref}/></bpmn:boundaryEvent>
    <bpmn:scriptTask id="Task_Recover" scriptFormat="bpm-expr">
      <bpmn:script>복구 = error_code</bpmn:script></bpmn:scriptTask>
    <bpmn:endEvent id="End_2"/>
    <bpmn:sequenceFlow id="f3" sourceRef="Bnd_Fail" targetRef="Task_Recover"/>
    <bpmn:sequenceFlow id="f4" sourceRef="Task_Recover" targetRef="End_2"/>
  </bpmn:process>
</bpmn:definitions>
"""


def process(*, where: str = "pc", named: bool = False) -> Any:
    errors = '<bpmn:error id="Err_Task" name="TASK_FAILED" errorCode="TASK_FAILED"/>' if named else ""
    return read_process(
        SHELL.format(errors=errors, where=where, error_ref='errorRef="Err_Task"' if named else "")
    )


@dataclass
class Flaky:
    """처음 `lost`번은 답을 못 받고 그다음은 답한다."""

    lost: int = 1
    error: ServiceCallError = field(
        default_factory=lambda: ServiceCallError(
            "ext-credit에 닿지 못했다 (ReadTimeout)", code="unreachable", outcome_unknown=True
        )
    )
    calls: list[OpCall] = field(default_factory=list)

    def call(self, request: OpCall) -> OpOutcome:
        self.calls.append(request)
        if len(self.calls) <= self.lost:
            raise self.error
        return OpOutcome(output={"grade": "A"}, mode_used=request.mode, duration_ms=0)


def start(found: Any, services: Flaky) -> tuple[Engine, Run]:
    engine = Engine()
    run = engine.start(found, run_id=RUN_ID, log=RunLog(run_id=RUN_ID), now=NOW, env=RunEnv(services=services))
    return engine, run


def reply(engine: Engine, run: Run, request_id: str, decision: str) -> State:
    engine.answer(run, request_id, {DECISION_KEY: decision}, answered_by="현장 담당")
    return engine.run_until_blocked(run)


def the_question(engine: Engine, run: Run) -> Any:
    assert engine.run_until_blocked(run) is State.WAITING
    (pending,) = run.pendings.values()
    return pending


# ─────────────────────────── 칸이 부르는 쪽까지 온다 ───────────────────────────


def test_the_c15_field_reaches_the_service_call_error() -> None:
    request = OpCall(app_id="ext-credit", operation="check", mode="deterministic", input={}, run_id=RUN_ID,
                     node_id="Task_Call", node_instance=1, attempt=1, call_seq=1)
    result = {"state": "failed", "error": {"code": "unreachable", "message": "답이 없다", "outcome_unknown": True}}
    with pytest.raises(ServiceCallError) as caught:
        _outcome(request, result, duration_ms=0)
    assert caught.value.outcome_unknown is True and caught.value.retryable is False


def test_outcome_unknown_and_retryable_are_never_both_true() -> None:
    """다시 불러도 안전하면 모름이 아니다 (C15)."""
    assert ServiceCallError("x", retryable=True, outcome_unknown=True).outcome_unknown is False


# ─────────────────────────── PC — 사람에게 묻는다 ───────────────────────────


# ─────────────────────────── 묻지 않는 곳 ───────────────────────────


def test_a_server_run_goes_to_the_error_boundary_as_before() -> None:
    engine, run = start(process(where="server"), Flaky())
    assert engine.run_until_blocked(run) is State.DONE
    assert run.pendings == {} and run.variables["복구"] == "TASK_FAILED"


def test_a_boundary_named_task_failed_takes_it_without_asking() -> None:
    engine, run = start(process(named=True), Flaky())
    assert engine.run_until_blocked(run) is State.DONE
    assert run.pendings == {} and run.variables["복구"] == "TASK_FAILED"


def test_a_failure_that_is_not_unknown_does_not_ask() -> None:
    refused = Flaky(error=ServiceCallError("거절", code="operation_failed"))
    engine, run = start(process(), refused)
    assert engine.run_until_blocked(run) is State.DONE
    assert run.pendings == {} and run.variables["복구"] == "TASK_FAILED"
