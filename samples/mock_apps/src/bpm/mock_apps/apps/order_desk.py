"""모의 주문 창구 — 한 토픽에 일꾼 종류 셋(AI·API·RPA). 사내 확장 `order-desk`의 서버 부분. FX-26이 부른다.

참고 문서 5장의 「통합 일꾼」 그림을 모의로 옮긴 것이다 (ADR-0135). **RPA는 가짜다** — 화면을 만지지 않고
입력 `화면`이 `정상`이 아니면 「칸을 찾지 못했다」로 실패한다. 값은 케이스가 정한다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from bpm.contracts.service_app import KIND_AI, KIND_API, KIND_RPA, OpRequest
from bpm.mock_apps.c11 import MockApp, Op, Scenario
from bpm.service_kit import OpError


def draft_order(req: OpRequest, scenario: Scenario) -> Mapping[str, Any]:
    """AI 작업 자리 — 요청 글에서 품목·수량을 읽어 초안과 결정을 낸다 (모의라 규칙으로)."""
    item = str(req.input["품목"])
    qty = int(req.input["수량"])
    return {"draft": {"품목": item, "수량": qty}, "decision": "proceed" if qty > 0 else "review"}


def reserve_stock(req: OpRequest, scenario: Scenario) -> Mapping[str, Any]:
    """API 호출 자리 — 재고를 잡는다. 예약 번호는 입력에서 짓는다 (다시 불러도 같은 번호 — 멱등)."""
    return {"status": "예약", "reservation_id": f"RSV-{req.input['품목']}-{req.input['수량']}"}


def release_stock(req: OpRequest, scenario: Scenario) -> Mapping[str, Any]:
    """보상 처리기 — 잡은 재고를 놓는다."""
    return {"status": "해제", "reservation_id": str(req.input["reservation_id"])}


def enter_order(req: OpRequest, scenario: Scenario) -> Mapping[str, Any]:
    """RPA 자리(가짜) — 기간계 주문 화면에 넣는다. 화면이 바뀌었으면 실패한다."""
    if req.input.get("화면") != "정상":
        raise OpError("ui_element_missing", "주문 화면에서 수량 칸을 찾지 못했다", status=422)
    return {"order_no": f"ORD-{req.input['reservation_id']}"}


APP = MockApp(
    app_id="order-desk",
    name="모의 주문 창구",
    extension="order-desk",
    used_by=("FX-26",),
    doc="주문 초안(AI)·재고 예약·해제(API)·주문 화면 입력(RPA, 가짜)",
    ops=(
        Op("draft_order", "요청 글로 주문 초안과 결정을 낸다", draft_order, kind=KIND_AI),
        Op("reserve_stock", "재고 예약", reserve_stock, kind=KIND_API),
        Op("release_stock", "재고 예약 해제 (보상)", release_stock, kind=KIND_API),
        Op("enter_order", "기간계 주문 화면 입력 (가짜 RPA)", enter_order, kind=KIND_RPA),
    ),
)

__all__ = ["APP"]
