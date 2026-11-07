"""통합 일꾼의 몸 — 업무 처리기와 외부 확장 정의를 토픽 목록 하나로 모은다 (ADR-0135 §4).

일감을 가져가고 끝내는 일은 `service_kit.Consumer`가 그대로 한다 (토픽 여럿을 이미 맡는다). 여기서 하는 것은
**모으기와 검사**다.

- 종류 `ai`·`rpa`(그리고 처리기가 직접 부르는 `api`)는 업무 처리기가 준다 — 작업마다의 종류는 manifest가 말한다.
- 종류 `api`의 외부 확장은 정의 파일에서 어댑터 일꾼과 같은 코드로 맡는다 (`bpm.adapter_consumer`).
- **같은 토픽을 둘이 맡으면 뜨지 않는다** — Center는 토픽마다 manifest 하나를 쓰므로 어느 쪽이 일감을 받을지
  조용히 갈린다.
- **흐름은 쥐지 않는다.** 순서·분기·보상은 엔진과 Center의 일이다.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from bpm.contracts.service_app import KINDS
from bpm.service_kit import TopicService
from bpm.unified_consumer.handlers import HandlerFailure, LoadedHandlers

log = logging.getLogger("bpm.unified_consumer")

#: 외부 확장 정의에서 온 토픽의 출처 이름.
ADAPTER_SOURCE = "adapter"


class TopicClash(ValueError):
    """같은 토픽을 둘이 맡으려 한다."""


@dataclass(frozen=True)
class Topic:
    service: TopicService
    #: 어디서 왔나 — 업무 처리기 이름 또는 `adapter`.
    source: str

    @property
    def kinds(self) -> dict[str, list[str]]:
        """일꾼 종류 → 작업 이름들."""
        out: dict[str, list[str]] = {}
        for op in self.service.manifest.operations:
            out.setdefault(op.kind, []).append(op.name)
        return out


@dataclass
class UnifiedConsumer:
    """맡을 토픽 목록. `services`를 `service_kit.Consumer`에 그대로 넘긴다."""

    topics: list[Topic] = field(default_factory=list)
    failures: list[HandlerFailure] = field(default_factory=list)

    @classmethod
    def assemble(
        cls,
        handlers: Sequence[LoadedHandlers],
        adapters: Sequence[TopicService],
        *,
        failures: Sequence[HandlerFailure] = (),
    ) -> UnifiedConsumer:
        made = cls(failures=list(failures))
        for loaded in handlers:
            for service in loaded.services:
                made._add(Topic(service=service, source=loaded.name))
        for service in adapters:
            made._add(Topic(service=service, source=ADAPTER_SOURCE))
        return made

    def _add(self, topic: Topic) -> None:
        taken = next((one for one in self.topics if one.service.app_id == topic.service.app_id), None)
        if taken is not None:
            raise TopicClash(
                f"토픽 「{topic.service.app_id}」을 {taken.source}와 {topic.source}가 함께 맡으려 한다 — 하나만 둔다"
            )
        unknown = sorted(set(topic.kinds) - KINDS)
        if unknown:
            # 열린 문자열이라 막지 않는다 (원칙 10) — 다만 오타일 수 있으니 말한다.
            log.warning("토픽 %s에 모르는 일꾼 종류가 있다: %s", topic.service.app_id, ", ".join(unknown))
        self.topics.append(topic)

    @property
    def services(self) -> list[TopicService]:
        return [one.service for one in self.topics]

    def describe(self) -> dict[str, Any]:
        """무엇을 맡았나 — 뜰 때 로그와 일꾼 콘솔이 읽는다. 종류별로 묶는다."""
        by_kind: dict[str, list[str]] = {}
        for topic in self.topics:
            for kind, names in topic.kinds.items():
                by_kind.setdefault(kind, []).extend(f"{topic.service.app_id}.{name}" for name in names)
        return {
            "topics": [{"topic": one.service.app_id, "source": one.source, "kinds": one.kinds} for one in self.topics],
            "by_kind": {kind: sorted(names) for kind, names in sorted(by_kind.items())},
            "failures": [{"name": one.name, "message": one.message} for one in self.failures],
        }


__all__ = ["ADAPTER_SOURCE", "Topic", "TopicClash", "UnifiedConsumer"]
