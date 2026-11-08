"""통합 일꾼 — 업무 처리기(AI·API·RPA 작업)와 외부 확장 정의를 일꾼 하나로 맡는다 (C15, ADR-0135).

업무 처리기(회사 저장소의 패키지)가 쓰는 공개 면은 `handlers`다 — `HandlerContext`·`HandlerFactory`·
엔트리 포인트 그룹 `bpm.consumer_handlers`. 토픽은 `service_kit.Service`로 짓는다.
"""

from bpm.unified_consumer.handlers import (
    ENTRY_POINT_GROUP,
    HANDLER_API,
    HandlerContext,
    HandlerFactory,
    HandlerFailure,
    LoadedHandlers,
    load,
)
from bpm.unified_consumer.host import Topic, TopicClash, UnifiedConsumer

__all__ = [
    "ENTRY_POINT_GROUP",
    "HANDLER_API",
    "HandlerContext",
    "HandlerFactory",
    "HandlerFailure",
    "LoadedHandlers",
    "Topic",
    "TopicClash",
    "UnifiedConsumer",
    "load",
]
