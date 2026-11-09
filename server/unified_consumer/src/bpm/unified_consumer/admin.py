"""통합 일꾼의 관리 API — 서비스 앱과 **같은** `/admin/v1/status`·`usage` (C11, ADR-0135).

일꾼 콘솔을 새로 만들지 않는다. 서비스 앱 콘솔(SVC-00~03)이 이 API를 그대로 그리고, 다른 것은 작업 줄·사용 기록의
`topic`뿐이다(토픽이 여럿이라서).

- **사용 기록은 여기서 한 줄로 쓴다** — 업무 처리기의 `Service`는 제 기록을 따로 들지만 어댑터 일꾼의 토픽은 기록이
  없다. 그래서 일꾼 뼈대(`Consumer`)와 토픽 사이에 `RecordingTopic`을 끼워 **모든 토픽을 같은 기록**에 남긴다.
  업무 값은 적지 않는다 (원칙 6 — 부른 쪽·작업·결과·소요만).
- 관문은 서비스 앱과 같은 `admin_guard`다 — 관리자 토큰이 없으면 503이고 빈 토큰으로 열리지 않는다.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import FastAPI, Request

from bpm.contracts.external_task import LockedTask
from bpm.contracts.service_app import (
    AdminStatus,
    CenterRegistration,
    HealthResponse,
    ServiceAppManifest,
    UsagePage,
    UsageRecord,
)
from bpm.service_kit import CatalogSource, Outcome, TopicService, UsageLog, admin_guard
from bpm.service_kit.admin import USAGE_DEFAULT_LIMIT, USAGE_MAX_LIMIT, operation_stats

#: 관리 API에 보이는 이 일꾼의 이름 (C11 `AdminStatus.app_id`).
APP_ID = "unified-consumer"
APP_NAME = "통합 일꾼"


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _version() -> str:
    try:
        return version("bpm-unified-consumer")
    except PackageNotFoundError:  # pragma: no cover - 워크스페이스 밖에서 부를 때
        return "0.0.0"


@dataclass
class RecordingTopic:
    """토픽 하나를 감싸 일감마다 사용 기록 한 줄을 남긴다. 나머지는 감싼 토픽 그대로다."""

    inner: TopicService
    log: UsageLog
    now: Callable[[], str] = _now

    @property
    def app_id(self) -> str:
        return self.inner.app_id

    @property
    def manifest(self) -> ServiceAppManifest:
        return self.inner.manifest

    @property
    def catalogs(self) -> Mapping[str, CatalogSource]:
        return self.inner.catalogs

    @property
    def extension_definition(self) -> dict[str, Any] | None:
        """외부 확장 토픽이면 그 정의 — 일꾼 뼈대가 Center에 올린다 (ADR-0122)."""
        found: dict[str, Any] | None = getattr(self.inner, "extension_definition", None)
        return found

    @property
    def extension_address(self) -> dict[str, Any] | None:
        """외부 확장 토픽이면 지금 쓰는 주소 — 정의와 함께 Center에 알린다 (ADR-0138)."""
        found: dict[str, Any] | None = getattr(self.inner, "extension_address", None)
        return found

    @property
    def publishes_manifest(self) -> bool:
        """원본이 콘솔인 외부 확장이면 manifest를 올리지 않는다 (ADR-0141)."""
        return bool(getattr(self.inner, "publishes_manifest", True))

    def execute(self, task: LockedTask) -> Outcome:
        started = time.monotonic()
        outcome = self.inner.execute(task)
        if outcome.skip:
            return outcome  # 같은 칸이 아직 도는 중 — 그쪽이 끝낼 때 센다
        if outcome.ok:
            status = 200
        else:
            status = 503 if outcome.retryable else 422
        response = outcome.response
        self.log.record(
            UsageRecord(
                at=self.now(),
                key_name=f"{task.caller.type}:{task.caller.host or '-'}",
                operation=task.operation,
                mode=response.mode_used if response is not None and response.mode_used else task.mode,
                status=status,
                duration_ms=int((time.monotonic() - started) * 1000),
                run_id=task.idempotency.run_id,
                caller_type=task.caller.type,
                usage=response.usage if response is not None else None,
                topic=task.topic,
            )
        )
        return outcome


def recorded(services: Sequence[TopicService], log: UsageLog) -> list[RecordingTopic]:
    return [RecordingTopic(inner=one, log=log) for one in services]


def create_admin_app(
    services: Sequence[TopicService] | Callable[[], Sequence[TopicService]],
    *,
    admin_token: str | None,
    log: UsageLog,
    center: Callable[[], CenterRegistration] | None = None,
    now: Callable[[], str] = _now,
) -> FastAPI:
    """`/healthz`와 관리 API. `services`는 맡은 토픽들(순서대로 작업 줄을 잇는다) — 콘솔 원본 토픽이 나중에
    더해지므로 지금 목록을 주는 함수여도 된다 (ADR-0141)."""
    topics = services if callable(services) else lambda: services
    app = FastAPI(title=APP_NAME, version=_version())
    app.state.admin_token = admin_token
    started_at = now()

    @app.get("/healthz")
    def healthz() -> HealthResponse:
        return HealthResponse(status="ok", version=_version())

    @app.get("/admin/v1/status")
    def status(request: Request) -> Any:
        refused = admin_guard(request)
        if refused is not None:
            return refused
        at = now()
        uptime = int((datetime.fromisoformat(at) - datetime.fromisoformat(started_at)).total_seconds())
        operations = [
            row for one in topics() for row in operation_stats(one.manifest, log, now=at, topic=one.app_id)
        ]
        return AdminStatus(
            schema=1,
            app_id=APP_ID,
            name=APP_NAME,
            version=_version(),
            category="system",
            started_at=started_at,
            uptime_s=max(uptime, 0),
            operations=operations,
            center=center() if center else CenterRegistration(),
        )

    @app.get("/admin/v1/usage")
    def usage(request: Request, limit: int = USAGE_DEFAULT_LIMIT) -> Any:
        refused = admin_guard(request)
        if refused is not None:
            return refused
        entries = list(getattr(log, "entries", []) or [])
        bounded = max(1, min(limit, USAGE_MAX_LIMIT))
        return UsagePage(items=list(reversed(entries))[:bounded], total=len(entries))

    return app


__all__ = ["APP_ID", "APP_NAME", "RecordingTopic", "create_admin_app", "recorded"]
