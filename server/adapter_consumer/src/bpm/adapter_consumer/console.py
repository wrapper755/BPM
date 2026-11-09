"""원본이 콘솔인 외부 확장 정의를 Center에서 받아 쓴다 (C15 §콘솔이 원본인 정의 받기, ADR-0141).

콘솔(CON-18)에서 만들고 고친 HTTP 어댑터 앱은 일꾼이 파일로 들고 있지 않다. 일꾼은
`GET /consumers/self/extensions`로 **맡은 토픽 안의 철회하지 않은 판 모두**와 공개키를 받아

1. 봉투를 공개키로 **다시 검증한다** (C13 E6 — 실행하는 쪽과 같은 관문). 지나지 못한 판은 쓰지 않고 까닭을 남긴다.
2. 토픽마다 `AdapterService` 하나를 짓고 판들을 끼운다. 일감은 실린 판(`definition_version`)으로 부르고, 그 판이
   없으면 한 번 다시 받은 뒤에도 없으면 `definition_unavailable`로 끝낸다 (`AdapterService.execute`).
3. 파일 정의와 id가 겹치면 **Center 것을 쓰고** 파일 것은 내린다(올리지도 않는다) — 경고를 남긴다.
4. 쓰는 주소를 알린다 (`PUT /consumers/self/address`) — 바뀌었을 때만.

받는 때는 `service_kit.Consumer.publish`가 정한다 — 뜰 때와 카탈로그를 다시 보는 주기마다. 다 철회돼도
토픽은 남긴다(일감이 오면 까닭을 들고 실패한다 — 조용히 「모르는 토픽」이 되지 않는다).
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from bpm.adapter_consumer.adapter import AdapterService
from bpm.contracts.extension import ExtensionManifest, verify_external
from bpm.contracts.external_task import ConsumerExtensions
from bpm.contracts.signing import Envelope
from bpm.service_kit import Consumer, TopicService

log = logging.getLogger("bpm.adapter_consumer")

EXTENSIONS_PATH = "/api/v1/consumers/self/extensions"
ADDRESS_PATH = "/api/v1/consumers/self/address"


@dataclass
class ConsoleDefinitions:
    """원본이 콘솔인 토픽들 — `service_kit.Consumer`의 `sources`에 꽂는다."""

    environ: Mapping[str, str] = field(default_factory=lambda: dict(os.environ))
    client: Any = None  # 외부 앱으로 나가는 httpx.Client (시험이 끼운다)
    resolver: Any = None  # 호스트 → IP (시험이 끼운다)
    #: 지은 토픽을 감싼다 — 통합 일꾼이 쓰임을 적는 껍질을 씌운다 (`unified_consumer.admin.recorded`).
    wrap: Callable[[TopicService], TopicService] | None = None
    #: 확장 id → 그 토픽 (감싸기 전).
    services: dict[str, AdapterService] = field(default_factory=dict)
    #: `id@판` → 쓰지 못한 까닭 (조용히 사라지지 않는다).
    problems: dict[str, str] = field(default_factory=dict)
    _sent: dict[str, dict[str, str | None]] = field(default_factory=dict, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def sync(self, consumer: Consumer) -> None:
        """Center에서 받아 판을 맞춘다. 일감 스레드에서도 불리므로(`refetch`) 한 번에 하나만 한다."""
        with self._lock:
            found = ConsumerExtensions.model_validate(consumer.get(EXTENSIONS_PATH))
            held = self._verified(found)
            for ext_id, versions in held.items():
                self._place(consumer, ext_id, versions)
            for ext_id, service in self.services.items():
                if ext_id not in held and service.versions:
                    log.warning("콘솔이 원본인 외부 확장 %s의 판이 모두 내려갔다 — 그 일감은 실패한다", ext_id)
                    service.use_versions({}, None)
            self._report(consumer)

    def _verified(self, found: ConsumerExtensions) -> dict[str, dict[str, ExtensionManifest]]:
        """봉투를 검증한 판들 — 확장 id → 판 → 정의. 받은 차례(새 판부터)를 지킨다."""
        out: dict[str, dict[str, ExtensionManifest]] = {}
        problems: dict[str, str] = {}
        for one in found.extensions:
            slot = f"{one.id}@{one.version}"
            if one.definition is None or one.envelope is None:
                problems[slot] = "정의나 서명 봉투가 없다"
                continue
            try:
                envelope = Envelope.model_validate(one.envelope)
                failed = verify_external(one.definition, envelope, keys=found.keys)
                manifest = None if failed else ExtensionManifest.model_validate(one.definition)
            except ValueError as e:
                problems[slot] = f"정의를 읽지 못했다 ({type(e).__name__})"
                continue
            if manifest is None:
                problems[slot] = "; ".join(str(v) for v in failed)
                continue
            out.setdefault(manifest.id, {})[manifest.version] = manifest
        for slot, why in sorted(problems.items()):
            if self.problems.get(slot) != why:
                log.warning("콘솔이 원본인 외부 확장 %s를 쓰지 못한다: %s", slot, why)
        self.problems = problems
        return out

    def _place(self, consumer: Consumer, ext_id: str, versions: dict[str, ExtensionManifest]) -> None:
        latest = next(iter(versions.values()))
        service = self.services.get(ext_id)
        if service is not None:
            if service.definition.version != latest.version:
                log.info("외부 확장 %s를 %s판으로 바꿨다 (콘솔)", ext_id, latest.version)
            service.use_versions(versions, latest)
            return
        clash = consumer.service(ext_id)
        if clash is not None:
            # 정의마다 원본은 하나다 — Center 것이 이긴다 (C15). 파일 것은 올리지도 않는다.
            log.warning("외부 확장 %s는 콘솔이 원본이다 — 정의 파일의 것을 쓰지 않는다", ext_id)
            consumer.drop_service(clash)
        service = AdapterService(definition=latest, environ=self.environ, client=self.client, resolver=self.resolver)
        service.use_versions(versions, latest)
        service.refetch = lambda: self.sync(consumer)
        self.services[ext_id] = service
        consumer.add_service(self.wrap(service) if self.wrap is not None else service)
        log.info("외부 확장 %s@%s를 Center에서 받았다 (콘솔)", ext_id, latest.version)

    def _report(self, consumer: Consumer) -> None:
        """쓰는 주소를 알린다 — 바뀌었을 때만. 알리지 못해도 일은 한다(보여 주기만 하는 값이다)."""
        for ext_id, service in self.services.items():
            address = service.extension_address
            if self._sent.get(ext_id) == address:
                continue
            try:
                consumer.put(ADDRESS_PATH, {"extension_id": ext_id, "address": address})
            except Exception as e:  # noqa: BLE001
                log.warning("외부 확장 %s의 쓰는 주소를 알리지 못했다 (%s)", ext_id, type(e).__name__)
                continue
            self._sent[ext_id] = address


__all__ = ["ADDRESS_PATH", "EXTENSIONS_PATH", "ConsoleDefinitions"]
