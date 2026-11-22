"""종료(terminate) 끝 이벤트 (C14 §이벤트, ADR-0189) — 같은 범위에 남은 가지를 모두 걷고 끝낸다.

| 무엇을 | 왜 |
| --- | --- |
| 한 가지가 종료에 닿으면 다른 가지가 걷히고 `success`로 끝난다 | 일반 끝이면 영원히 기다렸다 (§3-25) |
| 걷힌 노드는 `skipped` — 종료의 `completed` 뒤, `run_finished` 앞 | 「기다리는 중」으로 남지 않게 (C3) |
| 맡긴 작업·외부 작업은 거둔다, 호출이 띄운 안쪽 실행의 기다림도 | 받을 쪽이 없어졌다 — 중단 경계와 같은 길 |
| 하위 프로세스 안의 종료는 그 하위 프로세스만 끝낸다 | BPMN의 뜻 — 바깥 가지는 그대로 돈다 |
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime
from typing import Any

from bpm.contracts.bpmn_ext import read_process
from bpm.core.delegation import RecordingDelegator
from bpm.core.engine import Engine, Run, RunEnv, State
from bpm.core.run_log import RunLog
from bpm.core.services import OpCall, ServicePending

NOW = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
RUN_ID = "run_20261121_090000_abc123"

SHELL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1" id="Defs">
  <bpmn:process id="{process_id}" name="시험">
    <bpmn:extensionElements><bpm:process>{{}}</bpm:process></bpmn:extensionElements>
    {body}
  </bpmn:process>
</bpmn:definitions>
"""

TERMINATE = '<bpmn:endEvent id="End_Stop"><bpmn:terminateEventDefinition/></bpmn:endEvent>'
APPROVAL = (
    '<bpmn:userTask id="Approve"><bpmn:extensionElements>'
    '<bpm:approval>{"title": "확인"}</bpm:approval></bpmn:extensionElements></bpmn:userTask>'
)
TIMER = (
    '<bpmn:intermediateCatchEvent id="Wait_Timer"><bpmn:timerEventDefinition>'
    "<bpmn:timeDuration>P3D</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>"
)
SERVICE = (
    '<bpmn:serviceTask id="Ask_App"><bpmn:extensionElements><bpm:serviceCall>'
    '{"app_id": "hr", "operation": "lookup", "input": {}, "output": {}}'
    "</bpm:serviceCall></bpmn:extensionElements></bpmn:serviceTask>"
)
DELEGATE = (
    '<bpmn:callActivity id="Hand_Over" calledElement="fin.erp-input"><bpmn:extensionElements>'
    '<bpm:call>{"delegate": {"bpm_process_id": "fin.erp-input"}, "input": {}, "output": {}}</bpm:call>'
    "</bpmn:extensionElements></bpmn:callActivity>"
)


def make(body: str, process_id: str = "test.terminate") -> Any:
    return read_process(SHELL.format(body=body, process_id=process_id))


def flow(id_: str, source: str, target: str) -> str:
    return f'<bpmn:sequenceFlow id="{id_}" sourceRef="{source}" targetRef="{target}"/>'


def script(id_: str, body: str) -> str:
    return f'<bpmn:scriptTask id="{id_}" scriptFormat="bpm-expr"><bpmn:script>{body}</bpmn:script></bpmn:scriptTask>'


def race(waiting: str, waiting_id: str, *, late: bool = False) -> Any:
    """두 가지 — 하나는 `waiting`에서 멈추고, 다른 하나는 스크립트 뒤 종료에 닿는다.

    `late`면 종료 쪽이 타이머(`TIMER`) 뒤에 온다 — 다른 가지가 멈출 때까지 다 돈 뒤에 걷는다.
    """
    first = "Wait_Timer" if late else "Decide"
    return make(
        '<bpmn:startEvent id="Start"/>'
        + waiting
        + '<bpmn:endEvent id="End_Slow"/>'
        + (TIMER + flow("f0", "Wait_Timer", "Decide") if late else "")
        + script("Decide", "취소 = true")
        + TERMINATE
        + flow("f1", "Start", waiting_id)
        + flow("f2", waiting_id, "End_Slow")
        + flow("f3", "Start", first)
        + flow("f4", "Decide", "End_Stop")
    )


def start(process: Any, env: RunEnv | None = None) -> tuple[Engine, Run]:
    engine = Engine()
    # 시계는 `NOW`에 묶는다 — 진짜 시계로 타이머를 재면 날짜가 지나며 `tick()`이 이르게 된다.
    env = dataclasses.replace(env or RunEnv(), clock=lambda: NOW)
    run = engine.start(process, run_id=RUN_ID, log=RunLog(run_id=RUN_ID), now=NOW, env=env)
    return engine, run


def states(run: Run, node_id: str) -> list[str]:
    return [str(e.data["state"]) for e in run.log.events if e.kind == "node_state" and e.node_id == node_id]


class Parking:
    """올리면 넘겨받는다(`ServicePending`) — 서버 실행기의 긴 외부 작업 (ADR-0103)."""

    def __init__(self) -> None:
        self.withdrawn: list[str] = []

    def call(self, request: OpCall) -> Any:
        raise ServicePending(f"xt_{request.attempt}")

    def withdraw(self, task_id: str) -> None:
        self.withdrawn.append(task_id)


# ─────────────────────────── 맨 바깥 ───────────────────────────


def test_terminate_sweeps_a_waiting_approval_and_finishes_with_success() -> None:
    engine, run = start(race(APPROVAL, "Approve"))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.pendings == {} and run.waits == {} and run.tokens == []
    assert states(run, "Approve") == ["started", "waiting", "skipped"]
    assert states(run, "End_Slow") == [], "걷힌 가지는 더 가지 않는다"

    # C3 차례 — 종료 이벤트의 started → completed → 걷힌 노드 skipped → run_finished.
    tail = [(e.kind, e.node_id, e.data.get("state")) for e in run.log.events if e.kind != "log"][-4:]
    assert tail == [
        ("node_state", "End_Stop", "started"),
        ("node_state", "End_Stop", "completed"),
        ("node_state", "Approve", "skipped"),
        ("run_finished", None, None),
    ]
    assert run.log.events[-1].data["status"] == "success"


def test_terminate_sweeps_a_timer() -> None:
    engine, run = start(race(TIMER, "Wait_Timer"))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.waits == {}
    assert states(run, "Wait_Timer")[-1] == "skipped"


def test_terminate_withdraws_a_waited_external_task() -> None:
    service = Parking()
    engine, run = start(race(SERVICE, "Ask_App"), RunEnv(services=service))
    assert engine.run_until_blocked(run) is State.DONE
    assert service.withdrawn == ["xt_1"]
    assert engine.external_waits(run) == []


def test_terminate_withdraws_a_delegation() -> None:
    port = RecordingDelegator()
    engine, run = start(race(DELEGATE, "Hand_Over"), RunEnv(processes={}, delegate=port))
    assert engine.run_until_blocked(run) is State.DONE
    assert port.withdrawn == ["job_dlg001"]


def test_terminate_sweeps_what_a_called_process_waits_for() -> None:
    """호출이 띄운 안쪽 실행의 결재·외부 작업도 걷는다 — 안쪽을 버리기만 하면 외부 작업이 남는다."""
    child = make(
        '<bpmn:startEvent id="In_Start"/>' + SERVICE + '<bpmn:endEvent id="In_End"/>'
        + flow("g1", "In_Start", "Ask_App") + flow("g2", "Ask_App", "In_End"),
        process_id="other.proc",
    )
    call = (
        '<bpmn:callActivity id="Call_Other" calledElement="other.proc"><bpmn:extensionElements>'
        '<bpm:call>{"input": {}, "output": {}}</bpm:call></bpmn:extensionElements></bpmn:callActivity>'
    )
    service = Parking()
    env = RunEnv(services=service, processes={"other.proc": child})
    engine, run = start(race(call, "Call_Other", late=True), env)
    assert engine.run_until_blocked(run) is State.WAITING
    assert [w.task_id for _, w in engine.external_waits(run)] == ["xt_1"], "안쪽이 외부 작업을 기다린다"
    engine.tick(run, datetime(2026, 11, 25, tzinfo=UTC))
    assert engine.run_until_blocked(run) is State.DONE
    assert service.withdrawn == ["xt_1"]
    assert run.children == {}
    assert states(run, "Ask_App")[-1] == "skipped" and states(run, "Call_Other")[-1] == "skipped"


def test_terminate_with_no_other_branch_is_a_plain_end() -> None:
    """BX-11의 모양 — 가지가 하나면 일반 끝과 같다."""
    engine, run = start(
        make('<bpmn:startEvent id="Start"/>' + TERMINATE + flow("f1", "Start", "End_Stop"))
    )
    assert engine.run_until_blocked(run) is State.DONE
    assert states(run, "End_Stop") == ["started", "completed"]
    assert not any(e.data.get("state") == "skipped" for e in run.log.events if e.kind == "node_state")


# ─────────────────────────── 하위 프로세스 안 ───────────────────────────


def sub_with_terminate() -> str:
    """하위 프로세스 — 안에서 결재를 기다리는 가지와 종료에 닿는 가지로 갈라진다."""
    return (
        '<bpmn:subProcess id="Sub">'
        + '<bpmn:startEvent id="In_Start"/>'
        + APPROVAL
        + '<bpmn:endEvent id="In_End"/>'
        + script("In_Decide", "안 = 1")
        + TERMINATE
        + flow("s1", "In_Start", "Approve")
        + flow("s2", "Approve", "In_End")
        + flow("s3", "In_Start", "In_Decide")
        + flow("s4", "In_Decide", "End_Stop")
        + "</bpmn:subProcess>"
    )


def test_terminate_inside_a_sub_process_ends_only_that_sub_process() -> None:
    process = make(
        '<bpmn:startEvent id="Start"/>'
        + TIMER
        + '<bpmn:endEvent id="End_Timer"/>'
        + sub_with_terminate()
        + script("After_Sub", "뒤 = 1")
        + '<bpmn:endEvent id="End_Sub"/>'
        + flow("f1", "Start", "Wait_Timer")
        + flow("f2", "Wait_Timer", "End_Timer")
        + flow("f3", "Start", "Sub")
        + flow("f4", "Sub", "After_Sub")
        + flow("f5", "After_Sub", "End_Sub")
    )
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.WAITING, "바깥 가지의 타이머는 그대로 기다린다"
    assert run.variables["뒤"] == 1, "하위 프로세스는 끝나고 다음으로 갔다"
    assert states(run, "Sub")[-1] == "completed"
    assert states(run, "Approve") == ["started", "waiting", "skipped"]
    assert run.pendings == {}
    assert [w.node_id for w in run.waits.values()] == ["Wait_Timer"]
    assert states(run, "Wait_Timer") == ["started", "waiting"]

    # 바깥 타이머가 울리면 실행은 일반 끝으로 닫힌다.
    engine.tick(run, datetime(2026, 11, 25, tzinfo=UTC))
    assert engine.run_until_blocked(run) is State.DONE
