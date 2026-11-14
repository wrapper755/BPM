"""Studio 시험 실행 — **미는 일은 `bpm.core.testrun.runner`가 한다** (ADR-0143).

여기 있는 것은 **Qt로 옮기는 일**뿐이다: `QTimer`가 `pump()`를 불러 화면이 멎지 않게 하고,
`core.testrun`이 알리는 넷을 신호로 바꾼다. 판정·케이스·보내기·맡기기의 규칙은 모두 저쪽에 있다.

Studio 설정(STU-10)을 시험 실행이 아는 값으로 옮기는 일도 여기다 (`run_settings`) —
**모델 키는 설정 파일에 없다** (환경변수, 그다음 OS 비밀 저장소).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from PySide6.QtCore import QObject, QTimer, Signal

from bpm.core.testrun.receiver import Receiver
from bpm.core.testrun.runner import (  # noqa: F401 - 다시 내보낸다 (쓰는 쪽은 한 자리만 본다)
    ERROR,
    FAIL,
    NO_CASE,
    NO_EXPECT,
    PASS,
    STEPS_PER_TICK,
    STOPPED,
    CaseDelegator,
    CaseSender,
    Outcome,
    Plan,
    compare,
    read_cases,
    resolve_inputs,
    summarize,
)
from bpm.core.testrun.runner import CaseRun as CoreCaseRun
from bpm.core.testrun.settings import RunSettings
from bpm.studio.settings import Settings

#: `pump()`를 얼마나 자주 부르나. 화면이 멎지 않을 만큼 자주.
TICK_MS = 10


def run_settings(settings: Settings) -> RunSettings:
    """Studio 설정 → 시험 실행이 바깥에 닿는 값. **모델 키는 여기서 푼다** (STU-10)."""
    from bpm.studio.credentials import StudioCredentials  # noqa: PLC0415

    return RunSettings(
        data_dir=settings.data_dir,
        outputs_dir=settings.outputs_dir,
        readable_dirs=tuple(settings.readable_dirs),
        writable_dirs=tuple(settings.writable_dirs),
        llm_base_url=settings.llm_base_url,
        llm_model=settings.llm_model,
        llm_api_key=StudioCredentials().llm_api_key() or "",
    )


class _ToSignals:
    """`core.testrun`이 알리는 넷 → Qt 신호 (`Listener`)."""

    def __init__(self, owner: CaseRun) -> None:
        self.owner = owner

    def said(self, line: str) -> None:
        self.owner.said.emit(line)

    def marked(self, states: Mapping[str, str]) -> None:
        self.owner.marked.emit(dict(states))

    def varied(self, variables: Mapping[str, Any]) -> None:
        self.owner.varied.emit(dict(variables))

    def ended(self, outcome: Outcome) -> None:
        """**늘 한 박자 미뤄** 알린다 — `start()`가 곧바로 실패하면 부르는 쪽이 아직 연결 중이고,
        케이스를 줄줄이 돌릴 때 다음 실행이 재귀로 쌓인다."""
        self.owner._timer.stop()
        QTimer.singleShot(0, lambda: self.owner.ended.emit(outcome))


class CaseRun(QObject):
    """케이스 하나를 돌린다 (STU-08·STU-09). **스레드를 만들지 않는다** — `QTimer`가 민다."""

    #: 로그 한 줄 (STU-09 「로그」 탭).
    said = Signal(str)
    #: 캔버스 노드 색 `{노드 id: running|done|failed|waiting}` (STU-09).
    marked = Signal(dict)
    #: 변수 한 벌 (STU-09 「변수」 탭).
    varied = Signal(dict)
    #: 끝났다.
    ended = Signal(object)

    def __init__(self, plan: Plan, receiver: Receiver | None = None, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.inner = CoreCaseRun(plan, receiver, listener=_ToSignals(self))
        self._timer = QTimer(self)
        self._timer.setInterval(TICK_MS)
        self._timer.timeout.connect(self._tick)

    # 창과 시험이 들여다보는 것들 — 미는 쪽이 바뀌어도 자리는 그대로다.
    @property
    def plan(self) -> Plan:
        return self.inner.plan

    @property
    def run(self) -> Any:
        return self.inner.run

    @property
    def adapter(self) -> CaseSender:
        return self.inner.adapter

    @property
    def delegator(self) -> CaseDelegator:
        return self.inner.delegator

    @property
    def states(self) -> dict[str, str]:
        return self.inner.states

    def start(self) -> None:
        self.inner.start()
        if self.inner.outcome is None:
            self._timer.start()

    def stop(self) -> None:
        self.inner.stopped = True

    def _tick(self) -> None:
        if not self.inner.pump():
            self._timer.stop()


__all__ = [
    "ERROR",
    "FAIL",
    "NO_CASE",
    "NO_EXPECT",
    "PASS",
    "STEPS_PER_TICK",
    "STOPPED",
    "TICK_MS",
    "CaseDelegator",
    "CaseRun",
    "Outcome",
    "Plan",
    "CaseSender",
    "compare",
    "read_cases",
    "resolve_inputs",
    "summarize",
    "run_settings",
]
