"""업무 처리기 — 통합 일꾼에 얹는 패키지의 공개 면 (ADR-0135 §4).

업무 처리기는 **회사의 업무 규칙**이라 그 회사 저장소에 둔다 (첫째는 Company1). 이 저장소는 그것을
import하지 않고 엔트리 포인트로만 찾는다 — 확장과 같은 규칙이다 (ADR-0018).

    [project.entry-points."bpm.consumer_handlers"]
    company1 = "company1_worker.handlers:services"

엔트리 포인트가 가리키는 것은 `HandlerContext`를 받아 **토픽 목록**(`TopicService` — 보통
`service_kit.Service`)을 돌려주는 함수다. 작업마다의 일꾼 종류(`ai`·`api`·`rpa`)는 그 토픽의
manifest가 말한다 (C11 `Operation.kind`).

이 면이 바뀌면 판(`HANDLER_API`)을 올리고 업무 처리기가 고친다 — 바깥 저장소가 따라오는 자리다.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from importlib.metadata import EntryPoint, entry_points
from pathlib import Path

from bpm.service_kit import TopicService

log = logging.getLogger("bpm.unified_consumer.handlers")

#: 엔트리 포인트 그룹.
ENTRY_POINT_GROUP = "bpm.consumer_handlers"
#: 업무 처리기가 기대는 면의 판 — `HandlerContext`·`HandlerFactory`의 모양이 바뀌면 올린다.
HANDLER_API = "1"
#: 업무 처리기 설정 환경변수의 앞머리 — `BPM_CONSUMER__HANDLERS__<이름>__<칸>`.
HANDLER_ENV_PREFIX = "BPM_CONSUMER__HANDLERS__"


def _env_name(text: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in text).upper()


@dataclass(frozen=True)
class HandlerContext:
    """통합 일꾼이 업무 처리기에 주는 것. **비밀은 여기 없다** — 처리기가 환경변수로 직접 읽는다."""

    #: 엔트리 포인트 이름.
    name: str
    #: 그 처리기가 제 파일(작업 상태·멱등 저장소)을 둘 폴더. 통합 일꾼이 만들어 준다.
    data_dir: Path
    environ: Mapping[str, str] = field(default_factory=lambda: dict(os.environ))

    def setting(self, key: str, default: str | None = None) -> str | None:
        """`BPM_CONSUMER__HANDLERS__<이름>__<KEY>` — 처리기의 설정 칸 하나."""
        found = self.environ.get(f"{HANDLER_ENV_PREFIX}{_env_name(self.name)}__{_env_name(key)}")
        return found if found not in (None, "") else default


#: 엔트리 포인트가 가리키는 함수의 모양.
HandlerFactory = Callable[[HandlerContext], Sequence[TopicService]]


@dataclass(frozen=True)
class LoadedHandlers:
    name: str
    services: tuple[TopicService, ...]


@dataclass(frozen=True)
class HandlerFailure:
    name: str
    message: str


def load(
    *,
    data_dir: Path,
    enabled: Iterable[str] | None = None,
    environ: Mapping[str, str] | None = None,
    found: Callable[[], Iterable[EntryPoint]] | None = None,
) -> tuple[list[LoadedHandlers], list[HandlerFailure]]:
    """설치된 업무 처리기를 찾아 토픽을 받는다. **하나가 깨져도 나머지는 켠다** — 사유는 실패 목록에 남는다.

    `enabled`가 있으면 그 이름만 켠다(없는 이름은 실패로 적는다). `found`는 시험이 엔트리 포인트 대신 준다.
    """
    points = sorted(found() if found is not None else entry_points(group=ENTRY_POINT_GROUP), key=lambda e: e.name)
    wanted = set(enabled) if enabled is not None else None
    loaded: list[LoadedHandlers] = []
    failures: list[HandlerFailure] = []
    for point in points:
        if wanted is not None and point.name not in wanted:
            continue
        folder = data_dir / point.name
        try:
            factory = point.load()
            folder.mkdir(parents=True, exist_ok=True)
            context = HandlerContext(
                name=point.name, data_dir=folder, environ=dict(environ if environ is not None else os.environ)
            )
            services = tuple(factory(context))
        except Exception as e:  # noqa: BLE001 — 바깥 저장소의 코드다. 무엇이 터져도 그 처리기만 끈다
            failures.append(HandlerFailure(name=point.name, message=f"{type(e).__name__}: {e}"))
            log.warning("업무 처리기 %s를 켜지 못했다: %s", point.name, e)
            continue
        loaded.append(LoadedHandlers(name=point.name, services=services))
    if wanted is not None:
        missing = sorted(wanted - {one.name for one in points})
        failures += [HandlerFailure(name=one, message="설치된 업무 처리기가 아니다") for one in missing]
    return loaded, failures


__all__ = [
    "ENTRY_POINT_GROUP",
    "HANDLER_API",
    "HANDLER_ENV_PREFIX",
    "HandlerContext",
    "HandlerFactory",
    "HandlerFailure",
    "LoadedHandlers",
    "load",
]
