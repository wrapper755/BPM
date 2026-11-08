"""AI 작업 뼈대 (C11 「AI 작업」, ADR-0135 §3) — 검증을 지난 응답만 내고, 누가 어느 판으로 불렀는지 싣는다.

| 무엇을 | 왜 |
| --- | --- |
| 결정론 러너도 같은 검증을 지난다 | 업무 예제·시연이 검증을 건너뛰는 지름길이 되지 않게 |
| 입력·근거에 없는 숫자, 찾지 않은 근거 id는 버린다 | 그럴듯한 숫자 하나가 틀려도 눈으로는 안 잡힌다 |
| 버린 사유를 알려 다시 묻고, 끝내 안 되면 `ai_rejected` | 자율 수행으로 넘어가지 않는다 — 오류 경계가 받는다 |
| `model_called`는 정말 불렀을 때만 참 | 「모델을 불렀는가」를 기록이 단정할 수 있어야 한다 |
| 모델이 없으면 `llm_unavailable`, 잠깐 막히면 `dependency_down` | C11 오류 그대로 — 지어낸 답을 주지 않는다 |
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from bpm.contracts.external_task import LockedTask
from bpm.contracts.service_app import ServiceAppManifest
from bpm.llm import LlmError, RecordingLlm, Reply
from bpm.service_kit import OpError, Service, ServiceLlm
from bpm.unified_consumer.ai import (
    AI_FAILED,
    AI_REJECTED,
    AiOperation,
    AiPrompt,
    Evidence,
    FailingRunner,
    FolderKnowledge,
    LlmRunner,
    MockRunner,
    StaticKnowledge,
    numbers_in_text,
)

CONTEXT: dict[str, Any] = {"model": "B", "prior": 12000, "latest": 11300, "drop_rate": 0.0583, "loss": 14000000}
KNOWLEDGE = StaticKnowledge(
    [
        Evidence(id="POL-7", text="감소율 5% 이상이면 경영검토 대상이다"),
        Evidence(id="FAQ-2", text="휴가 신청은 3일 전까지"),
    ]
)

REVIEW = AiOperation(
    agent_id="volume-review",
    agent_version="1",
    prompt_version="v3",
    instructions="물량 변동을 검토해 결정을 낸다.",
    required=("decision", "summary", "evidence_refs"),
    text_fields=("summary",),
    knowledge=KNOWLEDGE,
    query=lambda context: "감소율 경영검토",
    input_evidence=lambda context: [f"model:{context['model']}"],
)

GOOD = {
    "decision": "review",
    "summary": "B모델이 12,000대에서 11,300대로 줄어 감소율 5.83%, 손실 14백만원이다.",
    "evidence_refs": ["POL-7", "model:B"],
}


def answering(*answers: dict[str, Any]) -> MockRunner:
    queue = list(answers)
    return MockRunner(lambda prompt: queue.pop(0) if len(queue) > 1 else queue[0])


def test_a_valid_answer_comes_back_with_its_provenance() -> None:
    result = REVIEW.run(CONTEXT, answering(GOOD))
    output = dict(result.output)
    provenance = output.pop("provenance")
    assert output == GOOD
    assert provenance["agent_id"] == "volume-review" and provenance["prompt_version"] == "v3"
    assert provenance["model_called"] is False and provenance["runner"] == "mock"
    assert provenance["execution_id"].startswith("aix_")


def test_only_the_evidence_that_matched_the_query_is_given() -> None:
    seen: list[AiPrompt] = []

    def answer(prompt: AiPrompt) -> dict[str, Any]:
        seen.append(prompt)
        return GOOD

    REVIEW.run(CONTEXT, MockRunner(answer))
    assert [one.id for one in seen[0].evidence] == ["POL-7"]


@pytest.mark.parametrize(
    ("bad", "reason"),
    [
        ({**GOOD, "summary": "감소율 6.5%로 크다."}, "입력·근거에 없는 숫자: 6.5%"),
        ({**GOOD, "summary": "손실이 15백만원이다."}, "입력·근거에 없는 숫자: 15000000"),
        ({**GOOD, "evidence_refs": ["POL-9"]}, "찾지 않은 근거 id: POL-9"),
        ({"decision": "review", "evidence_refs": []}, "필수 칸이 없다: summary"),
    ],
)
def test_an_answer_that_does_not_hold_up_is_thrown_away(bad: dict[str, Any], reason: str) -> None:
    errors = REVIEW.validate(bad, CONTEXT, KNOWLEDGE.search("감소율", limit=8))
    assert any(reason in one for one in errors), errors


def test_a_rounded_percent_and_dates_are_allowed() -> None:
    fine = {**GOOD, "summary": "7월 16일 기준 감소율 5.8%, 기준선 5%를 넘었다."}
    assert REVIEW.validate(fine, CONTEXT, KNOWLEDGE.search("감소율", limit=8)) == []


def test_it_asks_again_with_the_reasons_and_then_takes_the_good_answer() -> None:
    prompts: list[AiPrompt] = []
    answers = [{**GOOD, "summary": "손실 99백만원"}, GOOD]

    def answer(prompt: AiPrompt) -> dict[str, Any]:
        prompts.append(prompt)
        return answers[len(prompts) - 1]

    result = REVIEW.run(CONTEXT, MockRunner(answer))
    assert result.output["decision"] == "review"
    assert prompts[0].rejected == () and any("99000000" in one for one in prompts[1].rejected)


def test_after_the_last_attempt_it_fails_as_ai_rejected_and_does_not_fall_back() -> None:
    with pytest.raises(OpError) as caught:
        REVIEW.run(CONTEXT, answering({**GOOD, "evidence_refs": ["NOPE"]}))
    assert caught.value.code == AI_REJECTED and caught.value.status == 422
    assert caught.value.detail is not None and caught.value.detail["agent_id"] == "volume-review"


def test_a_failing_runner_is_ai_failed() -> None:
    with pytest.raises(OpError) as caught:
        REVIEW.run(CONTEXT, FailingRunner())
    assert caught.value.code == AI_FAILED


def test_the_llm_runner_says_the_model_was_called_and_adds_up_usage() -> None:
    model = RecordingLlm(
        replies=[
            Reply(text="답: " + json.dumps({**GOOD, "evidence_refs": ["X"]}), model="m1", input_tokens=10),
            Reply(text=json.dumps(GOOD, ensure_ascii=False), model="m1", input_tokens=12, output_tokens=5),
        ]
    )
    result = REVIEW.run(CONTEXT, LlmRunner(ServiceLlm(model, model="m1")))
    assert result.output["provenance"]["model_called"] is True
    assert result.output["provenance"]["runner"] == "llm:m1"
    assert result.usage is not None and result.usage.input_tokens == 22 and result.usage.output_tokens == 5
    assert "POL-7" in model.asked[0][1]["content"], "찾은 근거가 모델에게 간다"
    assert "찾지 않은 근거 id: X" in model.asked[1][-1]["content"], "버린 사유를 알려 다시 묻는다"


def test_without_a_model_it_is_llm_unavailable_and_a_hiccup_is_dependency_down() -> None:
    with pytest.raises(OpError) as caught:
        REVIEW.run(CONTEXT, LlmRunner(ServiceLlm()))
    assert caught.value.code == "llm_unavailable"
    down = RecordingLlm(fails=LlmError("잠깐", retryable=True))
    with pytest.raises(OpError) as caught:
        REVIEW.run(CONTEXT, LlmRunner(ServiceLlm(down, model="m1")))
    assert caught.value.code == "dependency_down"


def test_a_reply_without_json_is_ai_failed() -> None:
    model = RecordingLlm(replies=[Reply(text="모르겠습니다", model="m1")])
    with pytest.raises(OpError) as caught:
        REVIEW.run(CONTEXT, LlmRunner(ServiceLlm(model, model="m1")))
    assert caught.value.code == AI_FAILED


def test_the_handler_runs_inside_a_service_and_a_rejection_goes_back_as_a_failure() -> None:
    manifest = ServiceAppManifest.model_validate(
        {
            "schema": 1,
            "app_id": "fake-company",
            "name": "시험",
            "version": "0.1.0",
            "category": "business",
            "console_url": "",
            "operations": [{"name": "review", "kind": "ai", "modes": ["deterministic"]}],
        }
    )
    service = Service(
        manifest=manifest, handlers={"review": REVIEW.handler(answering({**GOOD, "summary": "손실 1억"}))}
    )
    task = LockedTask.model_validate(
        {
            "task_id": "xt_1",
            "topic": "fake-company",
            "operation": "review",
            "kind": "ai",
            "mode": "deterministic",
            "origin": "run",
            "idempotency": {"run_id": "run_1", "node_id": "Task_review", "node_instance": 1, "attempt": 1},
            "caller": {"type": "server_runner", "host": "srv"},
            "input": CONTEXT,
            "lock_until": "2026-11-08T00:10:00Z",
            "deadline": "2026-11-08T00:10:00Z",
        }
    )
    outcome = service.execute(task)
    assert outcome.code == AI_REJECTED and outcome.retryable is False


def test_numbers_are_read_with_their_korean_units_and_ids_are_not_numbers() -> None:
    assert numbers_in_text("RUN-F02-001의 손실 14백만원, 1.5억, 감소율 7.4%") == [
        (Decimal(14_000_000), False),
        (Decimal(150_000_000), False),
        (Decimal("7.4"), True),
    ]


def test_a_folder_of_notes_is_a_knowledge_source(tmp_path: Path) -> None:
    (tmp_path / "policy").mkdir()
    (tmp_path / "policy" / "volume.md").write_text("감소율 5% 이상이면 검토", encoding="utf-8")
    (tmp_path / "other.txt").write_text("휴가 규정", encoding="utf-8")
    found = FolderKnowledge(tmp_path).search("감소율", limit=5)
    assert [one.id for one in found] == ["policy/volume.md"]
