"""시험용 업무 처리기 하나 — 통합 일꾼이 엔트리 포인트로 찾는 모양 그대로 (ADR-0135 §4).

**이 저장소에는 회사 업무 코드가 없다** — 업무 처리기는 회사 저장소에 있다(첫째는 Company1). 그래서 「통합 일꾼이
처리기를 찾아 종류별 토픽을 맡는다」를 보려면 가짜 하나가 필요하다 (`fake_extension.py`와 같은 결).

토픽 하나에 종류 둘이다 — `ai`(초안 쓰기)와 `rpa`(화면에 넣기, **가짜** — 실제 화면 조작은 없다, ADR-0114).
"""

from __future__ import annotations

from collections.abc import Sequence

from bpm.contracts.service_app import KIND_AI, KIND_RPA, OpRequest, ServiceAppManifest
from bpm.service_kit import OpError, OpResult, Service, TopicService
from bpm.unified_consumer import HandlerContext

#: 엔트리 포인트 값 — `EntryPoint(name, FACTORY, ENTRY_POINT_GROUP)`.
FACTORY = "fake_handlers:services"
BROKEN = "fake_handlers:broken"
TOPIC = "fake-company"

MANIFEST = ServiceAppManifest.model_validate(
    {
        "schema": 1,
        "app_id": TOPIC,
        "name": "시험 회사 업무",
        "version": "0.1.0",
        "category": "business",
        "console_url": "",
        "operations": [
            {
                "name": "draft_review",
                "kind": KIND_AI,
                "modes": ["deterministic", "autonomous"],
                "output_schema": {"type": "object", "required": ["decision"]},
            },
            {"name": "enter_order", "kind": KIND_RPA, "modes": ["deterministic"]},
        ],
    }
)


def services(context: HandlerContext) -> Sequence[TopicService]:
    """엔트리 포인트가 가리키는 함수. 설정 칸 `prefix`로 접수 번호의 앞머리를 받는다."""
    prefix = context.setting("prefix", "ORD")
    (context.data_dir / "started").write_text("1", encoding="utf-8")

    def draft_review(req: OpRequest, mode: str) -> OpResult:
        amount = int(req.input.get("amount", 0))
        return OpResult({"decision": "approve" if amount < 1000 else "review"})

    def enter_order(req: OpRequest, mode: str) -> OpResult:
        if not req.input.get("order_id"):
            raise OpError("input_invalid", "order_id가 없다", status=422)
        return OpResult({"receipt": f"{prefix}-{req.input['order_id']}"})

    return [Service(manifest=MANIFEST, handlers={"draft_review": draft_review, "enter_order": enter_order})]


def broken(context: HandlerContext) -> Sequence[TopicService]:
    raise RuntimeError("회사 시스템 주소가 없다")
