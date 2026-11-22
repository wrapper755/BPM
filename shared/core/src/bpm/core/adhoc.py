"""Ad Hoc 하위 프로세스 — 안의 활동을 **골라** 켠다.

C14 §Ad Hoc, [ADR-0190](../../../../../docs/decisions/0190-ad-hoc-subprocess.md).

고르는 쪽은 둘이다 — 들어갈 때 한 번 평가하는 **식**(`bpm:adHoc.activate`)이거나, 안쪽 활동을
도구로 보는 **운전사**(`bpm:adHoc.ai`)다. 요소는 고르지 않는다: 받은 목록대로 켜고 끝을 셀 뿐이다
(Camunda의 `activeElementsCollection`·AI Agent Sub-process와 같은 나눔).

- **활동 흐름** — 켠 활동에서 출발한 토큰들(안에서 갈라진 가지까지)이다. 토큰이 `Token.adhoc`로
  표를 들고 다니고, 나가는 흐름이 없는 노드를 지나면 그 토큰이 끝난다. 같은 표의 토큰이 하나도
  남지 않으면 그 흐름이 끝났다 — 엔진의 `_move`가 `flow_ended()`를 부른다.
- **상태는 바깥 토큰에** 있다 (`Token.adhoc_state`) — 스냅샷과 함께 가므로 결재를 기다리다
  실행기가 다시 떠도 남은 것부터 간다.
- **AI의 한 차례는 모델에 한 번 묻는 것**이다. 그 차례에 켠 것이 **다** 끝나야 다시 묻는다 —
  OpenAI 호환 대화는 부른 도구마다 답이 있어야 다음 물음을 받는다.

값은 실행 기록에 남지 않는다 (원칙 6) — `agent`·`llm_usage`·`log`(켠 활동 id)뿐이다.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from bpm.contracts.bpmn_ext import AdHoc, AdHocAi, AiTask, Node, ad_hoc_activities, ad_hoc_tools
from bpm.contracts.replay import ReplaySpec, ReplayStep
from bpm.core.agent import (
    DEFAULT_MAX_STEPS,
    RESULT_TYPES,
    AgentError,
    finished,
    goal_names,
    opening_messages,
)
from bpm.core.expr import evaluate, truthy
from bpm.core.llm import LlmError, Reply, ToolCall, ToolSpec
from bpm.core.replay import filled, templated
from bpm.core.run_state import (
    AdHocActivation,
    AdHocState,
    Context,
    EngineError,
    Go,
    Outcome,
    Run,
    TaskFailed,
    Token,
    Wait,
    new_token_id,
)

if TYPE_CHECKING:  # pragma: no cover
    from bpm.core.engine import Engine

#: 도구 인자 타입 → JSON 스키마 타입 (모델에게 알려 줄 모양).
_JSON_TYPES = {
    "string": "string",
    "date": "string",
    "int": "integer",
    "number": "number",
    "bool": "boolean",
    "list": "array",
    "dict": "object",
}

#: AI 방식의 첫 물음에 덧붙이는 말 — 도구가 곧 그림의 활동이다.
ADHOC_GUIDE = (
    "## 고를 수 있는 활동\n"
    "도구 하나가 업무 활동 하나다. 부르면 그 활동이 돌고, 끝나면 결과가 온다. 필요한 것만 고른다.\n"
    "더 할 활동이 없으면 도구를 부르지 말고 반환 JSON을 낸다."
)


def sub_key(node_id: str) -> str:
    """바깥 토큰이 기다리는 열쇠 — 하위 프로세스와 같다 (중단 경계가 안쪽을 걷는 길이 같다)."""
    return f"sub:{node_id}"


def spec_of(node: Node) -> AdHoc:
    spec: AdHoc | None = node.prop("adHoc")
    if spec is None or (spec.activate is None) == (spec.ai is None):
        raise EngineError(
            "`bpm:adHoc`에 activate(식)·ai 중 하나만 적는다 (B18)", node_id=node.id, code="adhoc_chooser"
        )
    return spec


def as_ai_task(ai: AdHocAi, tools: list[str]) -> AiTask:
    """AI 태스크의 물음·검증을 그대로 쓰려고 — 칸의 뜻이 같다 (ADR-0190 §5)."""
    return AiTask(
        goal=ai.goal,
        domain="llm",
        tools=tools,
        results=dict(ai.results),
        replay=ai.replay,
        limits=ai.limits,
        forbidden_actions=list(ai.forbidden_actions),
    )


# ─────────────────────────── 들어가기 ───────────────────────────


def handle_ad_hoc(context: Context) -> Outcome:
    """`adHocSubProcess` — 켤 것을 정하고 켠다. 켠 것이 없거나 곧바로 끝나면 지나간다."""
    run, token, node = context.run, context.token, context.node
    spec = spec_of(node)
    state = AdHocState()
    token.adhoc_state = state
    if spec.collect_into:
        run.variables[spec.collect_into] = []

    if spec.ai is not None:
        _begin_ai(context.engine, run, token, node, spec.ai, state)
        done = _ask(context.engine, run, token, node, spec.ai, state)
    else:
        picked = _activate_list(run, node, spec.activate or "")
        context.emit("log", level="info", message=f"켤 활동 {len(picked)}개")
        _plan(run, token, node, state, [AdHocActivation(id="", element=one) for one in picked])
        done = _advance(context.engine, run, token, node, spec, state)
    if done:
        _finish(run, token, node, spec, state)
        return Go()
    return Wait(key=sub_key(node.id))


def _activate_list(run: Run, node: Node, expression: str) -> list[str]:
    """`activate` 식 → 활동 id 목록. **id 또는 이름**을 받는다 (이름은 그 안에서 하나뿐일 때만)."""
    value = evaluate(expression, run.scope(node.id))
    if isinstance(value, str) or not isinstance(value, (list, tuple)):
        raise EngineError(
            f"activate는 활동 목록이어야 한다 ({type(value).__name__})", node_id=node.id, code="adhoc_activate_invalid"
        )
    activities = ad_hoc_activities(node)
    by_id = {a.id: a.id for a in activities}
    named: dict[str, list[str]] = {}
    for a in activities:
        if a.name:
            named.setdefault(a.name, []).append(a.id)
    out = []
    for one in value:
        if not isinstance(one, str):
            raise EngineError(
                f"activate의 항목은 활동 id·이름이어야 한다 ({type(one).__name__})",
                node_id=node.id, code="adhoc_activate_invalid",
            )
        if one in by_id:
            out.append(one)
        elif len(named.get(one, [])) == 1:
            out.append(named[one][0])
        else:
            why = "이름이 둘 이상이다" if named.get(one) else "그런 활동이 없다"
            raise EngineError(f"켤 수 없는 활동이다: {one} ({why})", node_id=node.id, code="adhoc_unknown_activity")
    return out


# ─────────────────────────── 켜기 ───────────────────────────


def _plan(run: Run, host: Token, node: Node, state: AdHocState, wanted: list[AdHocActivation]) -> None:
    """켤 차례를 세운다. 함께 돌면 곧바로 다 켜고, 차례로 돌면 줄에 세운다."""
    for one in wanted:
        state.seq += 1
        one.id = f"{node.id}#{state.seq}"
    if node.ordering == "Sequential":
        state.queue.extend(wanted)
    else:
        for one in wanted:
            _start(run, host, node, state, one)


def _start(run: Run, host: Token, node: Node, state: AdHocState, one: AdHocActivation) -> None:
    run.tokens.append(Token(id=new_token_id(), node_id=one.element, scope=(*host.scope, node.id), adhoc=one.id))
    state.active.append(one)
    run.log.emit("log", node_id=node.id, level="info", message=f"활동을 켠다: {one.element}")


def _advance(engine: Engine, run: Run, host: Token, node: Node, spec: AdHoc, state: AdHocState) -> bool:
    """다음 할 일 — 줄의 다음을 켜거나, 다시 묻거나, 끝을 알린다. **끝났으면 참.**"""
    if state.closing:
        return not state.active
    if state.queue and not state.active:
        _start(run, host, node, state, state.queue.pop(0))
        return False
    if state.active or state.queue:
        return False
    if spec.ai is not None and state.answered:
        return _ask(engine, run, host, node, spec.ai, state)
    return True


# ─────────────────────────── 활동 흐름이 끝났다 ───────────────────────────


def flow_ended(engine: Engine, run: Run, host: Token, node: Node, flow: str) -> bool:
    """활동 흐름 하나가 끝났다 — 모으고, 완료 조건을 보고, 다음으로. **하위 프로세스가 끝났으면 참.**"""
    spec = spec_of(node)
    state = host.adhoc_state
    if state is None:  # pragma: no cover — 바깥 토큰이 기다리는 동안 상태는 늘 있다
        raise EngineError("Ad Hoc 상태가 없다", node_id=node.id, code="adhoc_state_missing")
    one = next((a for a in state.active if a.id == flow), None)
    if one is None:
        return False  # 이미 걷힌 흐름 (완료 조건이 먼저 닫았다)
    state.active.remove(one)
    if spec.result and spec.collect_into:
        collected = run.variables.setdefault(spec.collect_into, [])
        collected.append(evaluate(spec.result, run.scope(node.id)))
    if spec.ai is not None and one.call_id:
        state.answered.append({"call_id": one.call_id, "content": _tool_result(run, spec.ai, one.element)})
    if not state.closing and node.completion_condition and truthy(node.completion_condition, run.scope(node.id)):
        run.log.emit("log", node_id=node.id, level="info", message="완료 조건이 참이다")
        _close(engine, run, host, node, state)
    return _advance(engine, run, host, node, spec, state)


def _close(engine: Engine, run: Run, host: Token, node: Node, state: AdHocState) -> None:
    """더 켜지 않는다. `cancelRemainingInstances`면 남은 흐름을 **종료 이벤트가 걷는 길로** 걷는다."""
    state.closing = True
    state.queue.clear()
    if node.cancel_remaining and state.active:
        run.log.emit("log", node_id=node.id, level="info", message=f"남은 활동 흐름 {len(state.active)}개를 걷는다")
        engine.sweep_inside(run, node.id, message="Ad Hoc이 끝나며 걷었다")
        state.active.clear()


def finish(run: Run, host: Token, node: Node) -> None:
    """`flow_ended()`가 참을 준 뒤 — 엔진이 바깥 토큰을 움직이기 **전에** 부른다."""
    state = host.adhoc_state
    if state is not None:
        _finish(run, host, node, spec_of(node), state)


def _finish(run: Run, host: Token, node: Node, spec: AdHoc, state: AdHocState) -> None:
    """끝 — AI면 결과·배운 것·사용량을 남긴다. 바깥 토큰을 움직이는 것은 부르는 쪽이다."""
    host.adhoc_state = None
    ai = spec.ai
    if ai is None:
        return
    if state.replay is not None:
        run.log.emit("node_state", node_id=node.id, state="replayed", task_type="ad_hoc")
    else:
        # 자율 수행이 배운 것. **엔진은 파일을 쓰지 않는다** — 시험 실행이 패키지에 적는다 (ADR-0028).
        run.learned.append(
            ReplaySpec(
                bpm_process_id=run.process.id,
                node_id=node.id,
                version=run.version,
                steps=[
                    ReplayStep(tool=s["tool"], arguments=templated(s["arguments"], run.variables), turn=s["turn"])
                    for s in state.learned
                ],
                answer=_last_answer(state),
                model=state.model,
            )
        )
    if state.model:
        run.log.emit(
            "llm_usage", node_id=node.id, model=state.model,
            input_tokens=state.input_tokens, output_tokens=state.output_tokens,
        )
    if not state.answered_by_model:
        for name in ai.results:
            run.variables[name] = None  # 완료 조건으로 끝나면 답이 없다 (ADR-0190 §5)


def _last_answer(state: AdHocState) -> str:
    last = state.messages[-1] if state.messages else {}
    return str(last.get("content") or "") if last.get("role") == "assistant" else ""


# ─────────────────────────── AI 방식 ───────────────────────────


def _begin_ai(engine: Engine, run: Run, host: Token, node: Node, ai: AdHocAi, state: AdHocState) -> None:
    """첫 물음을 세우고, 결정 수행이면 되밟을 차례를 기억에서 꺼낸다."""
    tools = [t.id for t in ad_hoc_tools(node)]
    task = as_ai_task(ai, tools)
    messages = opening_messages(task, context=_seen(run, ai))
    messages[-1]["content"] += "\n\n" + ADHOC_GUIDE
    state.messages = messages
    if run.mode != "deterministic" or ai.replay == "none" or run.env.memory is None:
        return
    remembered = run.env.memory.find(run.process.id, node.id)
    if remembered is None:
        run.log.emit("log", node_id=node.id, level="info", message="재생 명세가 없다 — 모델을 부른다")
        return
    turns: dict[int, list[dict[str, Any]]] = {}
    for step in remembered.steps:
        turns.setdefault(step.turn, []).append({"tool": step.tool, "arguments": dict(step.arguments)})
    state.replay = [turns[k] for k in sorted(turns)]
    state.replay_answer = remembered.answer
    state.model = remembered.model


def _seen(run: Run, ai: AdHocAi) -> dict[str, Any]:
    """모델에게 갈 값 — **목표에 이름이 나오는 변수**뿐이다 (C14 §AI 태스크가 보는 값)."""
    return {name: run.variables[name] for name in goal_names(ai.goal, run.variables)}


def _tool_result(run: Run, ai: AdHocAi, element: str) -> str:
    return json.dumps({"활동": element, "보이는 값": _seen(run, ai)}, ensure_ascii=False, default=str)


def _tool_specs(node: Node, ai: AdHocAi) -> list[ToolSpec]:
    properties = {name: {"type": _JSON_TYPES.get(kind, "string")} for name, kind in ai.inputs.items()}
    return [
        ToolSpec(name=t.id, description=t.name or t.id, parameters={"type": "object", "properties": properties})
        for t in ad_hoc_tools(node)
    ]


def _ask(engine: Engine, run: Run, host: Token, node: Node, ai: AdHocAi, state: AdHocState) -> bool:
    """한 차례 — 끝난 도구의 답을 넣고 모델(또는 기억)에게 묻는다. **끝났으면 참.**"""
    for answer in state.answered:
        state.messages.append({"role": "tool", "tool_call_id": answer["call_id"], "content": answer["content"]})
    state.answered = []
    task = as_ai_task(ai, [t.id for t in ad_hoc_tools(node)])
    step = state.turns + 1

    def note(action: str, tool: str = "") -> None:
        run.log.emit("agent", node_id=node.id, step=step, action=action, **({"tool": tool} if tool else {}))

    if state.replay is not None:
        reply = _replayed_reply(run, node, ai, state, task)
    else:
        limit = ai.limits.max_steps if ai.limits and ai.limits.max_steps else DEFAULT_MAX_STEPS
        if state.turns >= limit:
            raise EngineError(
                f"{limit}번 물었는데 끝나지 않았다 (`limits.max_steps`를 보라)", node_id=node.id, code="agent_error"
            )
        try:
            reply = run.env.llm.ask(state.messages, tools=_tool_specs(node, ai))
        except LlmError as e:
            raise TaskFailed(f"모델을 부르지 못했다: {e}", node_id=node.id) from e
        state.model = reply.model or state.model
        state.input_tokens += reply.input_tokens
        state.output_tokens += reply.output_tokens
    state.turns += 1

    if not reply.wants_tools:
        note("finish")
        state.messages.append({"role": "assistant", "content": reply.text})
        try:
            results = finished(task, reply.text)
        except AgentError as e:
            raise TaskFailed(str(e), node_id=node.id) from e
        run.variables.update(results)
        state.answered_by_model = True
        _close(engine, run, host, node, state)
        return not state.active

    note("plan", ",".join(c.name for c in reply.tool_calls))
    allowed = {t.id for t in ad_hoc_tools(node)}
    wanted = []
    for call in reply.tool_calls:
        if call.name not in allowed:
            # AI 태스크와 같다 — 허용 밖을 부른 것은 실행 오류다 (경계로 받지 않는다).
            raise EngineError(
                f"고를 수 없는 활동을 불렀다: {call.name} (고를 수 있는 것: {', '.join(sorted(allowed)) or '없음'})",
                node_id=node.id, code="agent_error",
            )
        wanted.append(AdHocActivation(id="", element=call.name, call_id=call.id,
                                      arguments=_checked_arguments(node, ai, call), turn=state.turns - 1))
    state.messages.append(_assistant(reply))
    for one in wanted:
        note("tool", one.element)
        run.variables.update(one.arguments)  # 켜기 **전에** 담는다 (ADR-0190 §5)
        if state.replay is None:
            state.learned.append({"tool": one.element, "arguments": dict(one.arguments), "turn": one.turn})
    _plan(run, host, node, state, wanted)
    return _advance(engine, run, host, node, spec_of(node), state)


def _checked_arguments(node: Node, ai: AdHocAi, call: ToolCall) -> dict[str, Any]:
    """모델이 넘긴 값 — `ai.inputs`에 적은 이름·타입만. 틀리면 **업무 실패**(모델이 틀렸다)."""
    bad = []
    for name, value in call.arguments.items():
        kind = ai.inputs.get(name)
        wanted = RESULT_TYPES.get(kind or "")
        if kind is None:
            bad.append(f"{name}은 받지 않는 값")
        elif wanted is not None and (
            not isinstance(value, wanted) or (isinstance(value, bool) and kind != "bool")
        ):
            bad.append(f"{name}: {kind}가 아니다")
    if bad:
        raise TaskFailed(f"{call.name}에 넘긴 값이 맞지 않는다 ({', '.join(bad)})", node_id=node.id)
    return dict(call.arguments)


def _assistant(reply: Reply) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": reply.text or None,
        "tool_calls": [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": json.dumps(call.arguments, ensure_ascii=False)},
            }
            for call in reply.tool_calls
        ],
    }


def _replayed_reply(run: Run, node: Node, ai: AdHocAi, state: AdHocState, task: AiTask) -> Reply:
    """결정 수행 — 기억의 다음 차례를 **모델 없이** 내준다. 다 되밟았으면 마지막 답.

    마지막 답: `results`가 없으면 빈 답(묻지 않는다), `full`이면 기억의 답, `plan`이면 **도구 없이**
    모델에게 한 번 묻는다(값 추출 — AI 태스크의 `finish_from`과 같다).
    """
    replay = state.replay or []
    if replay:
        turn = replay.pop(0)
        allowed = {t.id for t in ad_hoc_tools(node)}
        calls = []
        for index, step in enumerate(turn, start=1):
            if step["tool"] not in allowed:
                # **몰래 자율로 넘어가지 않는다** (ADR-0028 §6) — 업무 실패로 사람이 본다.
                raise TaskFailed(f"기억에 적힌 활동이 그림에 없다: {step['tool']}", node_id=node.id)
            arguments = filled(step["arguments"], run.variables)
            calls.append(ToolCall(id=f"r{state.turns + 1}_{index}", name=step["tool"], arguments=arguments))
        return Reply(tool_calls=tuple(calls))
    if not ai.results:
        return Reply(text="{}")
    if ai.replay == "full":
        return Reply(text=state.replay_answer)
    try:
        reply = run.env.llm.ask(state.messages)
    except LlmError as e:
        raise TaskFailed(f"모델을 부르지 못했다: {e}", node_id=node.id) from e
    state.model = reply.model or state.model
    state.input_tokens += reply.input_tokens
    state.output_tokens += reply.output_tokens
    return reply


__all__ = ["ADHOC_GUIDE", "as_ai_task", "finish", "flow_ended", "handle_ad_hoc", "spec_of", "sub_key"]
