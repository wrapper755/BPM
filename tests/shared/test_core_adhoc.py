"""Ad Hoc 하위 프로세스 (C14 §Ad Hoc, ADR-0190) — 식이 고르거나 AI가 고른다.

| 무엇을 | 왜 |
| --- | --- |
| 식이 준 것만 켜고, 켠 것이 다 끝나면 지나간다 | 요소는 고르지 않는다 — 목록대로 켜고 끝을 센다 |
| 이름으로도 고른다, 모르는 것은 그림·식 오류 | 경계로 받으면 그림의 버그가 업무 흐름에 숨는다 |
| 빈 목록이면 곧바로 끝난다 | 식 방식에는 「나중에 켤」 길이 없다 — 영원히 기다린다 |
| `Sequential`이면 하나씩, 안쪽 흐름도 한 활동 흐름이다 | 「확인 → 보완 요청」을 그릴 수 있어야 한다 |
| 완료 조건이 참이면 남은 것을 걷는다(`skipped`) / 기다린다 | `cancelRemainingInstances` |
| AI는 도구로 고르고, 켠 것이 다 끝나야 다시 묻는다 | 부른 도구마다 답이 있어야 다음 물음이 선다 |
| 결정 수행은 차례를 모델 없이 되밟는다 | 재생 (ADR-0028) — 몰래 자율로 넘어가지 않는다 |
| 기다리는 Ad Hoc이 스냅샷을 지나도 남은 것부터 간다 | 실행기가 다시 떠도 같은 답 |
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import pytest

from bpm.contracts.bpmn_ext import read_process, validate
from bpm.contracts.replay import ReplayMemory, ReplaySpec, ReplayStep
from bpm.core.engine import Engine, Run, RunEnv, State
from bpm.core.llm import Reply, ToolCall
from bpm.core.run_log import RunLog
from bpm.core.run_snapshot import dump, restore

NOW = datetime(2026, 11, 22, 9, 0, tzinfo=UTC)
RUN_ID = "run_20261122_090000_abc123"

SHELL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpm="urn:chaeksas:bpmn:1" id="Defs">
  <bpmn:process id="test.adhoc" name="시험">
    <bpmn:extensionElements><bpm:process>{{"inputs": [{inputs}]}}</bpm:process></bpmn:extensionElements>
    <bpmn:startEvent id="Start"/>
    <bpmn:adHocSubProcess id="Sub" {attrs}>
      <bpmn:extensionElements><bpm:adHoc>{spec}</bpm:adHoc></bpmn:extensionElements>
      {completion}
      {inner}
    </bpmn:adHocSubProcess>
    {after}
    <bpmn:endEvent id="End"/>
    <bpmn:sequenceFlow id="f_in" sourceRef="Start" targetRef="Sub"/>
    <bpmn:sequenceFlow id="f_out" sourceRef="Sub" targetRef="End"/>
  </bpmn:process>
</bpmn:definitions>
"""


def script(id_: str, body: str, name: str = "") -> str:
    named = f' name="{name}"' if name else ""
    return (
        f'<bpmn:scriptTask id="{id_}"{named} scriptFormat="bpm-expr"><bpmn:script>{body}</bpmn:script>'
        "</bpmn:scriptTask>"
    )


def approval(id_: str) -> str:
    return (
        f'<bpmn:userTask id="{id_}"><bpmn:extensionElements><bpm:approval>{{"title": "{id_}"}}</bpm:approval>'
        "</bpmn:extensionElements></bpmn:userTask>"
    )


def flow(id_: str, source: str, target: str) -> str:
    return f'<bpmn:sequenceFlow id="{id_}" sourceRef="{source}" targetRef="{target}"/>'


def make(
    spec: dict[str, Any],
    inner: str,
    *,
    ordering: str = "Parallel",
    cancel: bool = True,
    completion: str = "",
    inputs: str = "",
    after: str = "",
) -> Any:
    attrs = f'ordering="{ordering}" cancelRemainingInstances="{"true" if cancel else "false"}"'
    return read_process(
        SHELL.format(
            attrs=attrs,
            spec=json.dumps(spec, ensure_ascii=False),
            completion=f"<bpmn:completionCondition>{completion}</bpmn:completionCondition>" if completion else "",
            inner=inner,
            inputs=inputs,
            after=after,
        )
    )


def start(process: Any, *, env: RunEnv | None = None, inputs: dict[str, Any] | None = None,
          mode: str = "autonomous") -> tuple[Engine, Run]:
    engine = Engine()
    run = engine.start(
        process, run_id=RUN_ID, log=RunLog(run_id=RUN_ID), now=NOW, env=env or RunEnv(),
        inputs=inputs or {}, mode=mode,
    )
    return engine, run


def states(run: Run, node_id: str) -> list[str]:
    return [str(e.data["state"]) for e in run.log.events if e.kind == "node_state" and e.node_id == node_id]


def answer(engine: Engine, run: Run, node_id: str) -> State:
    request = next(p.request_id for p in run.pendings.values() if p.node_id == node_id)
    engine.answer(run, request, {"decision": "approve"}, answered_by="시험")
    return engine.run_until_blocked(run)


THREE = script("A", "가 = 1", name="가 확인") + script("B", "나 = 2", name="나 확인") + script("C", "다 = 3")


# ─────────────────────────── 식 방식 ───────────────────────────


def test_only_the_listed_activities_run_and_results_are_collected() -> None:
    process = make({"activate": "['A', 'C']", "result": "1", "collect_into": "모음"}, THREE)
    assert [v for v in validate(process) if v.severity == "error"] == []
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["가"] == 1 and run.variables["다"] == 3
    assert "나" not in run.variables, "켜지 않은 활동은 돌지 않는다"
    assert run.variables["모음"] == [1, 1]
    assert states(run, "Sub") == ["started", "waiting", "completed"]
    assert states(run, "End") == ["started", "completed"]


def test_activities_can_be_picked_by_name() -> None:
    engine, run = start(make({"activate": "['나 확인']"}, THREE))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["나"] == 2 and "가" not in run.variables


@pytest.mark.parametrize(
    ("expression", "code"),
    [("['없는것']", "adhoc_unknown_activity"), ("'A'", "adhoc_activate_invalid"), ("[1]", "adhoc_activate_invalid")],
)
def test_a_bad_list_is_a_drawing_error_not_a_business_failure(expression: str, code: str) -> None:
    engine, run = start(make({"activate": expression}, THREE))
    assert engine.run_until_blocked(run) is State.FAILED
    assert run.error is not None and run.error.code == code and run.error.node_id == "Sub"


def test_an_empty_list_finishes_at_once() -> None:
    engine, run = start(make({"activate": "[]", "result": "1", "collect_into": "모음"}, THREE))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["모음"] == []
    assert states(run, "Sub") == ["started", "completed"]


def test_the_same_activity_twice_runs_twice() -> None:
    engine, run = start(make({"activate": "['A', 'A']", "result": "가", "collect_into": "모음"}, THREE))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.variables["모음"] == [1, 1]


def test_sequential_runs_one_flow_at_a_time() -> None:
    process = make({"activate": "['Ask_1', 'Ask_2']"}, approval("Ask_1") + approval("Ask_2"), ordering="Sequential")
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.WAITING
    assert [p.node_id for p in run.pendings.values()] == ["Ask_1"], "둘째는 아직 켜지 않았다"
    assert answer(engine, run, "Ask_1") is State.WAITING
    assert [p.node_id for p in run.pendings.values()] == ["Ask_2"]
    assert answer(engine, run, "Ask_2") is State.DONE


def test_an_inner_flow_is_one_activity_flow() -> None:
    """A → B로 이은 것은 A를 켜면 B까지 간다. B가 끝나야 그 흐름이 끝난다."""
    inner = approval("Check") + script("Fix", "보완 = true") + flow("i1", "Check", "Fix")
    process = make({"activate": "['Check']", "result": "보완", "collect_into": "모음"}, inner)
    assert [v for v in validate(process) if v.severity == "error"] == []
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.WAITING
    assert answer(engine, run, "Check") is State.DONE
    assert run.variables["모음"] == [True], "결과는 흐름의 끝(B 뒤)에서 한 번 모인다"


def test_completion_sweeps_what_is_left() -> None:
    process = make(
        {"activate": "['Ask_1', 'Ask_2']", "result": "1", "collect_into": "모음"},
        approval("Ask_1") + approval("Ask_2"),
        completion="len(모음) >= 1",
    )
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.WAITING
    assert len(run.pendings) == 2
    assert answer(engine, run, "Ask_1") is State.DONE
    assert run.pendings == {} and run.waits == {}
    assert states(run, "Ask_2") == ["started", "waiting", "skipped"]
    assert run.variables["모음"] == [1]


def test_completion_without_cancel_waits_for_the_rest() -> None:
    process = make(
        {"activate": "['Ask_1', 'Ask_2']", "result": "1", "collect_into": "모음"},
        approval("Ask_1") + approval("Ask_2"),
        completion="len(모음) >= 1",
        cancel=False,
    )
    engine, run = start(process)
    engine.run_until_blocked(run)
    assert answer(engine, run, "Ask_1") is State.WAITING, "남은 것을 기다린다"
    assert answer(engine, run, "Ask_2") is State.DONE
    assert run.variables["모음"] == [1, 1]


def test_completion_does_not_start_the_queued_ones() -> None:
    process = make(
        {"activate": "['A', 'B', 'C']", "result": "1", "collect_into": "모음"},
        THREE, ordering="Sequential", completion="len(모음) >= 1", cancel=False,
    )
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.DONE
    assert "가" in run.variables and "나" not in run.variables


def test_an_interrupting_boundary_sweeps_the_inside() -> None:
    after = (
        '<bpmn:boundaryEvent id="Late" attachedToRef="Sub"><bpmn:timerEventDefinition>'
        "<bpmn:timeDuration>PT1H</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:boundaryEvent>"
        '<bpmn:endEvent id="End_Late"/>' + flow("f_late", "Late", "End_Late")
    )
    process = make({"activate": "['Ask_1']"}, approval("Ask_1"), after=after)
    engine, run = start(process)
    assert engine.run_until_blocked(run) is State.WAITING
    engine.tick(run, datetime(2026, 11, 22, 11, 0, tzinfo=UTC))
    assert engine.run_until_blocked(run) is State.DONE
    assert run.pendings == {} and all(t.adhoc_state is None for t in run.tokens)
    assert states(run, "End_Late") == ["started", "completed"]


def test_waiting_inside_survives_a_snapshot() -> None:
    process = make(
        {"activate": "['Ask_1', 'Ask_2']", "result": "1", "collect_into": "모음"},
        approval("Ask_1") + approval("Ask_2"), ordering="Sequential",
    )
    engine, run = start(process)
    engine.run_until_blocked(run)
    text = json.dumps(dump(run), ensure_ascii=False)
    again = restore(json.loads(text), process=run.process, log=RunLog(run_id=RUN_ID), env=run.env)
    host = next(t for t in again.tokens if t.adhoc_state is not None)
    assert [a.element for a in host.adhoc_state.queue] == ["Ask_2"]  # type: ignore[union-attr]
    assert answer(engine, again, "Ask_1") is State.WAITING
    assert answer(engine, again, "Ask_2") is State.DONE
    assert again.variables["모음"] == [1, 1]


# ─────────────────────────── AI 방식 ───────────────────────────


class Scripted:
    """차례마다 정해 둔 답을 내는 모델. 받은 물음을 적어 둔다."""

    def __init__(self, replies: Sequence[Reply]) -> None:
        self.replies = list(replies)
        self.asked: list[list[dict[str, Any]]] = []
        self.tools: list[list[str]] = []

    def ask(self, messages: Any, *, tools: Any = (), timeout_s: float | None = None) -> Reply:
        self.asked.append(json.loads(json.dumps(messages)))
        self.tools.append([t.name for t in tools])
        return self.replies.pop(0)


def call(name: str, id_: str, **arguments: Any) -> ToolCall:
    return ToolCall(id=id_, name=name, arguments=arguments)


AI = {
    "ai": {
        "goal": "모자란 서류를 받는다. 받은 결과는 `서류상태`에 있다.",
        "inputs": {"사유": "string"},
        "results": {"요약": "string"},
    }
}
AI_INNER = (
    approval("Ask_Id")
    + script("Ask_Bank", "서류상태 = '통장 받음: ' + 사유")
    + script("Fix", "고침 = 1")
    + flow("i1", "Ask_Id", "Fix")
)
AI_INPUTS = '{"name": "서류상태", "type": "string", "default": ""}'


def test_the_model_picks_activities_as_tools_and_answers_last() -> None:
    model = Scripted([
        Reply(tool_calls=(call("Ask_Bank", "c1", 사유="계좌 확인"),), model="m"),
        Reply(text=json.dumps({"요약": "다 받음"}), model="m"),
    ])
    process = make(AI, AI_INNER, inputs=AI_INPUTS)
    assert [v for v in validate(process) if v.severity == "error"] == []
    engine, run = start(process, env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.DONE
    assert model.tools[0] == ["Ask_Id", "Ask_Bank"], "들어오는 흐름이 없는 활동만 도구다"
    assert run.variables["사유"] == "계좌 확인", "도구 인자는 켜기 전에 변수로 간다"
    assert run.variables["요약"] == "다 받음"
    assert "고침" not in run.variables
    # 둘째 물음에 첫 도구의 답이 붙어 있다 — 보이는 값은 목표가 이름으로 가리킨 것뿐.
    tool_message = model.asked[1][-1]
    assert tool_message["role"] == "tool" and tool_message["tool_call_id"] == "c1"
    seen = {"서류상태": "통장 받음: 계좌 확인"}
    assert json.loads(tool_message["content"]) == {"활동": "Ask_Bank", "보이는 값": seen}
    # 자율 수행이 배운 것 — 차례가 붙는다.
    (learned,) = run.learned
    assert [(s.tool, s.turn) for s in learned.steps] == [("Ask_Bank", 0)]
    assert [e.data["action"] for e in run.log.events if e.kind == "agent"] == ["plan", "tool", "finish"]
    assert any(e.kind == "llm_usage" for e in run.log.events)


def test_the_model_is_asked_again_only_when_the_whole_turn_is_done() -> None:
    model = Scripted([
        Reply(tool_calls=(call("Ask_Id", "c1"), call("Ask_Bank", "c2", 사유="x"))),
        Reply(text=json.dumps({"요약": "끝"})),
    ])
    engine, run = start(make(AI, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.WAITING
    assert len(model.asked) == 1, "결재가 남았다 — 아직 묻지 않는다"
    assert answer(engine, run, "Ask_Id") is State.DONE
    assert run.variables["고침"] == 1, "Ask_Id의 흐름은 Fix까지다"
    answered = [m["tool_call_id"] for m in model.asked[1] if m["role"] == "tool"]
    assert sorted(answered) == ["c1", "c2"]


def test_a_tool_outside_the_list_is_an_execution_error() -> None:
    model = Scripted([Reply(tool_calls=(call("Fix", "c1"),))])
    engine, run = start(make(AI, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.FAILED
    assert run.error is not None and run.error.code == "agent_error"


def test_a_wrong_answer_is_a_business_failure_the_boundary_catches() -> None:
    after = (
        '<bpmn:boundaryEvent id="Oops" attachedToRef="Sub"><bpmn:errorEventDefinition/></bpmn:boundaryEvent>'
        '<bpmn:endEvent id="End_Oops"/>' + flow("f_oops", "Oops", "End_Oops")
    )
    model = Scripted([
        Reply(tool_calls=(call("Ask_Bank", "c1", 사유=3),)),  # 타입이 틀렸다
    ])
    engine, run = start(make(AI, AI_INNER, inputs=AI_INPUTS, after=after), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.DONE
    assert states(run, "End_Oops") == ["started", "completed"]
    assert run.variables["failed_task"] == "Sub"


def test_a_wrong_final_answer_after_waiting_still_goes_to_the_boundary() -> None:
    after = (
        '<bpmn:boundaryEvent id="Oops" attachedToRef="Sub"><bpmn:errorEventDefinition/></bpmn:boundaryEvent>'
        '<bpmn:endEvent id="End_Oops"/>' + flow("f_oops", "Oops", "End_Oops")
    )
    model = Scripted([Reply(tool_calls=(call("Ask_Id", "c1"),)), Reply(text="{}")])
    engine, run = start(make(AI, AI_INNER, inputs=AI_INPUTS, after=after), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.WAITING
    assert answer(engine, run, "Ask_Id") is State.DONE
    assert states(run, "Sub")[-1] == "failed" and states(run, "End_Oops") == ["started", "completed"]
    assert all(t.adhoc_state is None for t in run.tokens)


def test_a_completion_condition_ends_without_asking_and_leaves_results_empty() -> None:
    model = Scripted([Reply(tool_calls=(call("Ask_Bank", "c1", 사유="x"),))])
    process = make(AI, AI_INNER, inputs=AI_INPUTS, completion="서류상태 != ''")
    engine, run = start(process, env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.DONE
    assert len(model.asked) == 1 and run.variables["요약"] is None


def test_too_many_turns_stop_the_run() -> None:
    spec = {"ai": {**AI["ai"], "limits": {"max_steps": 2}}}
    model = Scripted([Reply(tool_calls=(call("Ask_Bank", f"c{i}", 사유="x"),)) for i in range(5)])
    engine, run = start(make(spec, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.FAILED
    assert run.error is not None and run.error.code == "agent_error" and len(model.asked) == 2


def memory(*steps: ReplayStep, answer: str = "") -> ReplayMemory:
    return ReplayMemory(
        schema=1,
        specs=[ReplaySpec(bpm_process_id="test.adhoc", node_id="Sub", steps=list(steps), answer=answer)],
    )


def test_deterministic_mode_replays_turns_without_the_model() -> None:
    model = Scripted([Reply(text=json.dumps({"요약": "뽑았다"}))])
    remembered = memory(
        ReplayStep(tool="Ask_Bank", arguments={"사유": "기억"}, turn=0),
        ReplayStep(tool="Ask_Bank", arguments={"사유": "또"}, turn=1),
    )
    engine, run = start(
        make(AI, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model, memory=remembered), mode="deterministic"
    )
    assert engine.run_until_blocked(run) is State.DONE
    assert len(model.asked) == 1, "plan — 마지막 값 추출만 한 번"
    assert model.tools == [[]], "값 추출에는 도구를 알려 주지 않는다"
    assert run.variables["사유"] == "또" and run.variables["요약"] == "뽑았다"
    assert "replayed" in states(run, "Sub") and run.learned == []


def test_full_replay_never_calls_the_model() -> None:
    model = Scripted([])
    spec = {"ai": {**AI["ai"], "replay": "full"}}
    remembered = memory(ReplayStep(tool="Ask_Bank", arguments={"사유": "기억"}), answer='{"요약": "기억한 답"}')
    engine, run = start(
        make(spec, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model, memory=remembered), mode="deterministic"
    )
    assert engine.run_until_blocked(run) is State.DONE
    assert model.asked == [] and run.variables["요약"] == "기억한 답"


def test_a_remembered_activity_that_is_gone_is_a_business_failure() -> None:
    remembered = memory(ReplayStep(tool="Gone", arguments={}))
    engine, run = start(
        make(AI, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=Scripted([]), memory=remembered), mode="deterministic"
    )
    assert engine.run_until_blocked(run) is State.FAILED
    assert run.error is not None and run.error.code == "TASK_FAILED"


def test_an_ai_turn_waiting_survives_a_snapshot() -> None:
    model = Scripted([Reply(tool_calls=(call("Ask_Id", "c1"),)), Reply(text=json.dumps({"요약": "끝"}))])
    engine, run = start(make(AI, AI_INNER, inputs=AI_INPUTS), env=RunEnv(llm=model))
    assert engine.run_until_blocked(run) is State.WAITING
    again = restore(json.loads(json.dumps(dump(run))), process=run.process, log=RunLog(run_id=RUN_ID), env=run.env)
    assert answer(engine, again, "Ask_Id") is State.DONE
    assert again.variables["요약"] == "끝"
    assert [m["tool_call_id"] for m in model.asked[1] if m["role"] == "tool"] == ["c1"]


# ─────────────────────────── 검사 B18 ───────────────────────────


def b18(process: Any) -> list[str]:
    return [v.message for v in validate(process) if v.rule == "B18"]


def test_b18_wants_exactly_one_chooser() -> None:
    assert b18(make({}, THREE))
    assert b18(make({"activate": "[]", **AI}, THREE))


def test_b18_rejects_start_and_end_events_inside() -> None:
    inner = THREE + '<bpmn:startEvent id="In_Start"/><bpmn:endEvent id="In_End"/>'
    assert any("시작·끝" in m for m in b18(make({"activate": "[]"}, inner)))


def test_b18_pairs_result_and_collect_into() -> None:
    assert any("함께" in m for m in b18(make({"activate": "[]", "result": "1"}, THREE)))


def test_b18_keeps_timeout_out_of_ad_hoc_ai() -> None:
    spec = {"ai": {**AI["ai"], "limits": {"timeout_s": 60}}}
    assert any("timeout_s" in m for m in b18(make(spec, AI_INNER, inputs=AI_INPUTS)))


def test_b9_does_not_ask_for_flows_inside() -> None:
    assert [v for v in validate(make({"activate": "[]"}, THREE)) if v.rule == "B9"] == []
