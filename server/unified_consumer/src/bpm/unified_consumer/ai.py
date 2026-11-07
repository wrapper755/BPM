"""AI 작업 뼈대 — `kind: ai`인 작업이 지키는 다섯 단계 (C11 「AI 작업」, ADR-0135 §3).

    review = AiOperation(
        agent_id="sc01-review-draft", agent_version="1", prompt_version="v3",
        instructions="…", required=("summary", "decision", "evidence_refs"),
        text_fields=("summary",), knowledge=StaticKnowledge([...]),
    )
    Service(manifest, {"draft_review": review.handler(LlmRunner(llm))})

1. **문맥** — 일감의 `input`(그림이 넘긴 변수)이 그대로 문맥이다. 지어낸 값을 더하지 않는다.
2. **지식 검색** — `KnowledgeSource`가 찾은 조각마다 **근거 id**가 있다. 모델은 그 id만 인용할 수 있다.
3. **추론** — 러너가 부른다. 모델이 숫자를 만들지 않도록 계산은 처리기가 미리 해서 입력에 넣는다.
4. **검증** — 필수 칸, 근거 id가 이번에 찾은(또는 입력이 준) 것인가, **본문의 숫자가 입력·근거에 있는가**.
   어긋나면 그 응답을 버리고 다시 묻는다(`attempts`). 끝내 안 되면 `ai_rejected`로 실패한다 — **자율 수행으로
   넘어가지 않는다**(폴백 없음). 그림은 오류 경계 + 사람 검토로 받는다.
5. **결과** — 출력 + `provenance{agent_id, agent_version, prompt_version, execution_id, model_called, runner}`.
   `model_called`는 이번 수행에서 모델을 정말 불렀는가다 — 결정론 러너면 false.

러너는 셋이다: `MockRunner`(결정론 — 업무 예제·시험·시연), `LlmRunner`(`ServiceLlm`), `FailingRunner`(실패 재현).
**결정론 러너도 같은 검증을 지난다** — 검증을 건너뛰는 지름길이 없다.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Protocol

from bpm.contracts.service_app import OpRequest, Usage
from bpm.service_kit import Handler, OpError, OpResult, ServiceLlm, usage_of

#: 검증을 끝내 지나지 못했다 — 다시 불러도 같은 모델·같은 입력이다 (C11 오류 표).
AI_REJECTED = "ai_rejected"
#: 러너가 답을 내지 못했다(모델이 JSON을 주지 않음·실패 재현) — 설정·입력 문제라 다시 해 볼 만하지 않다.
AI_FAILED = "ai_failed"
#: 출력에 덧붙이는 칸 이름.
PROVENANCE = "provenance"
#: 날짜·월·건수로 쓰이는 작은 정수 — 막으면 「7월 16일」을 쓸 수 없다. 대신 이 범위의 지표 값은 검사되지 않는다.
SMALL_INTEGERS = frozenset(Decimal(n) for n in range(32))


class AiFailure(Exception):
    """러너가 답을 내지 못했다. 지어낸 값으로 메우지 않는다."""


# ─────────────────────────── 지식 ───────────────────────────


@dataclass(frozen=True)
class Evidence:
    """지식 한 조각. `id`가 근거 id다 — 모델은 이것으로 인용한다."""

    id: str
    text: str
    source: str = ""


class KnowledgeSource(Protocol):
    def search(self, query: str, *, limit: int) -> Sequence[Evidence]: ...


@dataclass(frozen=True)
class StaticKnowledge:
    """정해 둔 조각들 — 질의 낱말이 하나라도 들어 있는 것을 순서대로 준다. 질의가 비면 앞에서부터."""

    items: Sequence[Evidence]

    def search(self, query: str, *, limit: int) -> Sequence[Evidence]:
        words = [one for one in re.split(r"\W+", query.lower()) if len(one) > 1]
        hits = [one for one in self.items if not words or any(w in one.text.lower() for w in words)]
        return list(hits[:limit])


@dataclass(frozen=True)
class FolderKnowledge:
    """폴더의 `.md`·`.txt` — 파일 하나가 조각 하나이고 근거 id는 폴더 안 상대 경로다."""

    folder: Path

    def search(self, query: str, *, limit: int) -> Sequence[Evidence]:
        items = [
            Evidence(id=path.relative_to(self.folder).as_posix(), text=path.read_text(encoding="utf-8"), source="file")
            for path in sorted(self.folder.rglob("*"))
            if path.is_file() and path.suffix in (".md", ".txt")
        ]
        return StaticKnowledge(items).search(query, limit=limit)


# ─────────────────────────── 러너 ───────────────────────────


@dataclass(frozen=True)
class AiPrompt:
    """러너에게 가는 것 — 지시문·문맥·근거·출력 모양."""

    instructions: str
    context: Mapping[str, Any]
    evidence: Sequence[Evidence]
    required: Sequence[str]
    #: 앞서 버린 응답의 사유 — 다시 물을 때 모델에게 알려 준다.
    rejected: Sequence[str] = ()

    def messages(self) -> list[dict[str, Any]]:
        body = {
            "context": self.context,
            "evidence": [{"id": one.id, "text": one.text} for one in self.evidence],
            "answer_with_keys": list(self.required),
        }
        rules = (
            "JSON 객체 하나로만 답한다. 근거는 evidence의 id로만 인용한다. "
            "숫자는 context·evidence에 있는 것만 쓴다 — 계산하거나 지어내지 않는다."
        )
        messages = [
            {"role": "system", "content": f"{self.instructions}\n\n{rules}"},
            {"role": "user", "content": json.dumps(body, ensure_ascii=False, default=str)},
        ]
        if self.rejected:
            messages.append(
                {
                    "role": "user",
                    "content": "앞 답은 이 까닭으로 버렸다 — 고쳐서 다시 답한다:\n" + "\n".join(self.rejected),
                }
            )
        return messages


@dataclass(frozen=True)
class Draft:
    output: dict[str, Any]
    #: 러너 이름 — `mock`·`llm:<모델>`.
    runner: str
    usage: Usage | None = None


class Runner(Protocol):
    @property
    def calls_model(self) -> bool:
        """실제 모델을 부르는가 — provenance의 `model_called`."""
        ...

    def draft(self, prompt: AiPrompt) -> Draft: ...


@dataclass(frozen=True)
class MockRunner:
    """결정론 러너 — 입력·근거로 답을 짓는 함수를 받는다. 업무 예제·시험·시연이 쓴다."""

    answer: Callable[[AiPrompt], Mapping[str, Any]]
    calls_model: bool = field(default=False, init=False)

    def draft(self, prompt: AiPrompt) -> Draft:
        return Draft(output=dict(self.answer(prompt)), runner="mock")


@dataclass(frozen=True)
class FailingRunner:
    """실패 재현 — 「AI가 답하지 못해도 업무는 이어 간다」를 그림이 받는지 본다."""

    reason: str = "AI 응답 실패(재현) — 사람이 직접 검토한다"
    calls_model: bool = field(default=False, init=False)

    def draft(self, prompt: AiPrompt) -> Draft:
        raise AiFailure(self.reason)


@dataclass
class LlmRunner:
    """`ServiceLlm`으로 묻는다. 모델이 없거나 막히면 `ServiceLlm`이 C11 오류로 올린다
    (`llm_unavailable`·`dependency_down`)."""

    llm: ServiceLlm
    calls_model: bool = field(default=True, init=False)

    def draft(self, prompt: AiPrompt) -> Draft:
        reply = self.llm.ask(prompt.messages())
        found = re.search(r"\{.*\}", reply.text, re.S)
        if found is None:
            raise AiFailure("응답에 JSON 객체가 없다")
        try:
            output = json.loads(found.group(0))
        except json.JSONDecodeError as e:
            raise AiFailure(f"JSON을 읽지 못했다: {e.msg}") from e
        if not isinstance(output, dict):
            raise AiFailure("응답이 JSON 객체가 아니다")
        return Draft(output=output, runner=f"llm:{reply.model or self.llm.model}", usage=usage_of([reply]))


# ─────────────────────────── 검증 ───────────────────────────

#: 숫자를 뽑기 전에 지우는 식별자 (RUN-F02-001, KRI01, R01-v1 …) — 이름 속 숫자를 값으로 읽지 않는다.
_ID = re.compile(r"\b[A-Za-z]+(?:[-_][A-Za-z0-9]+)*\d[\w-]*")
_NUM = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(%|백만\s*원|백만|만\s*원|만|억\s*원|억|원)?")
_SCALE = {"백만": Decimal(1_000_000), "만": Decimal(10_000), "억": Decimal(100_000_000)}


def numbers_in_text(text: str) -> list[tuple[Decimal, bool]]:
    """글 속 숫자 → (값, 퍼센트인가). 「14백만원」은 14000000이다."""
    out: list[tuple[Decimal, bool]] = []
    for raw, unit in _NUM.findall(_ID.sub(" ", text)):
        value = Decimal(raw.replace(",", ""))
        unit = (unit or "").replace(" ", "")
        for prefix, scale in _SCALE.items():
            if unit.startswith(prefix):
                value *= scale
                break
        out.append((value, unit == "%"))
    return out


def numbers_in_value(value: Any) -> set[Decimal]:
    """입력·근거에 있는 숫자 전부 — 숫자 값, 숫자 글, 글 속 숫자. 비율(1 미만)은 퍼센트로도 센다."""
    found: set[Decimal] = set()
    if isinstance(value, bool) or value is None:
        return found
    if isinstance(value, int | float | Decimal):
        number = Decimal(str(value))
        if not number.is_finite():  # 「NaN」·「Infinity」 글이 숫자로 읽힌다
            return found
        found |= {abs(number)}
        if abs(number) < 1:
            found.add(abs(number) * 100)
        return found
    if isinstance(value, str):
        try:
            return numbers_in_value(Decimal(value.replace(",", "")))
        except InvalidOperation:
            return {one for one, _ in numbers_in_text(value)}
    if isinstance(value, Mapping):
        for one in value.values():
            found |= numbers_in_value(one)
    elif isinstance(value, list | tuple):
        for one in value:
            found |= numbers_in_value(one)
    return found


def _texts(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, Mapping):
        return [t for one in value.values() for t in _texts(one)]
    if isinstance(value, list | tuple):
        return [t for one in value for t in _texts(one)]
    return []


@dataclass(frozen=True)
class AiOperation:
    """AI 작업 하나의 선언. `handler(runner)`가 `service_kit`의 작업 함수를 준다."""

    agent_id: str
    agent_version: str
    prompt_version: str
    instructions: str
    #: 출력에 꼭 있어야 하는 칸.
    required: Sequence[str]
    #: 숫자를 대조할 출력 칸 (글이거나 글 목록·사전 — 안의 글을 모두 본다).
    text_fields: Sequence[str] = ()
    #: 근거 id 목록이 들어갈 출력 칸. 비우면 근거를 보지 않는다.
    evidence_field: str | None = "evidence_refs"
    #: 입력에서 근거 id로 쓸 수 있는 것 (처리기가 계산한 결과 id 같은 것) — 일감 입력을 받아 id들을 준다.
    input_evidence: Callable[[Mapping[str, Any]], Iterable[str]] | None = None
    knowledge: KnowledgeSource | None = None
    #: 지식 질의 — 기본은 입력 글 전부.
    query: Callable[[Mapping[str, Any]], str] | None = None
    knowledge_limit: int = 8
    #: 검증에 실패하면 몇 번까지 물어보나 (처음 한 번 포함).
    attempts: int = 3
    #: 업무만의 검사 — 위반 사유 목록을 준다.
    check: Callable[[Mapping[str, Any], Mapping[str, Any]], Sequence[str]] | None = None
    #: 퍼센트는 표시 반올림(7.37 → 7.4)을 이만큼 봐 준다. 금액·물량은 정확히 같아야 한다.
    percent_tolerance: Decimal = Decimal("0.05")

    def evidence_for(self, context: Mapping[str, Any]) -> list[Evidence]:
        if self.knowledge is None:
            return []
        query = self.query(context) if self.query is not None else " ".join(_texts(dict(context)))
        return list(self.knowledge.search(query, limit=self.knowledge_limit))

    def validate(
        self, output: Mapping[str, Any], context: Mapping[str, Any], evidence: Sequence[Evidence]
    ) -> list[str]:
        """위반 사유 목록 — 비어 있어야 낸다."""
        errors = [f"필수 칸이 없다: {key}" for key in self.required if key not in output]
        if errors:
            return errors
        if self.evidence_field is not None:
            refs = output.get(self.evidence_field)
            if not isinstance(refs, list) or not all(isinstance(one, str) for one in refs):
                errors.append(f"{self.evidence_field}는 글 목록이어야 한다")
            else:
                known = {one.id for one in evidence}
                if self.input_evidence is not None:
                    known |= set(self.input_evidence(context))
                unknown = [one for one in refs if one not in known]
                if unknown:
                    errors.append(f"찾지 않은 근거 id: {', '.join(unknown[:5])}")
        allowed = SMALL_INTEGERS | numbers_in_value(dict(context))
        for one in evidence:
            allowed |= numbers_in_value(one.text)
        for key in self.text_fields:
            for text in _texts(output.get(key)):
                for value, percent in numbers_in_text(text):
                    ok = (
                        any(abs(value - known) <= self.percent_tolerance for known in allowed)
                        if percent
                        else value in allowed
                    )
                    if not ok:
                        errors.append(f"입력·근거에 없는 숫자: {value}{'%' if percent else ''} — 「{text[:40]}」")
        if self.check is not None:
            errors += list(self.check(output, context))
        return errors

    def run(self, context: Mapping[str, Any], runner: Runner) -> OpResult:
        """다섯 단계를 한 번 — 검증을 지난 출력 + provenance. 실패는 `OpError`다."""
        execution_id = f"aix_{uuid.uuid4().hex[:12]}"
        evidence = self.evidence_for(context)
        rejected: list[str] = []
        usages: list[Usage] = []
        for _ in range(max(1, self.attempts)):
            prompt = AiPrompt(self.instructions, context, evidence, self.required, rejected=tuple(rejected))
            try:
                draft = runner.draft(prompt)
            except AiFailure as e:
                raise OpError(AI_FAILED, f"{self.agent_id}: {e}", status=502) from e
            if draft.usage is not None:
                usages.append(draft.usage)
            rejected = self.validate(draft.output, context, evidence)
            if not rejected:
                provenance = {
                    "agent_id": self.agent_id,
                    "agent_version": self.agent_version,
                    "prompt_version": self.prompt_version,
                    "execution_id": execution_id,
                    "model_called": runner.calls_model,
                    "runner": draft.runner,
                }
                return OpResult({**draft.output, PROVENANCE: provenance}, usage=_sum(usages))
        raise OpError(
            AI_REJECTED,
            f"{self.agent_id}: {max(1, self.attempts)}번 물었지만 검증을 지나지 못했다 — {'; '.join(rejected[:3])}",
            status=422,
            detail={"agent_id": self.agent_id, "execution_id": execution_id, "reasons": rejected[:10]},
        )

    def handler(self, runner: Runner) -> Handler:
        """`service_kit.Service`에 넣을 작업 함수. 수행 모드는 바꾸지 않는다 — 결정 수행이어도 같은 길이다."""

        def handle(req: OpRequest, mode: str) -> OpResult:
            del mode  # AI 작업은 모드와 상관없이 같은 다섯 단계다 (C11 「AI 작업」)
            return self.run(req.input, runner)

        return handle


def _sum(usages: Sequence[Usage]) -> Usage | None:
    if not usages:
        return None
    return Usage(
        model=usages[-1].model,
        input_tokens=sum(one.input_tokens for one in usages),
        output_tokens=sum(one.output_tokens for one in usages),
    )


__all__ = [
    "AI_FAILED",
    "AI_REJECTED",
    "PROVENANCE",
    "AiFailure",
    "AiOperation",
    "AiPrompt",
    "Draft",
    "Evidence",
    "FailingRunner",
    "FolderKnowledge",
    "KnowledgeSource",
    "LlmRunner",
    "MockRunner",
    "Runner",
    "StaticKnowledge",
    "numbers_in_text",
    "numbers_in_value",
]
