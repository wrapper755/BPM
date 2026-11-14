"""시험 실행 — 작업 폴더 하나를 케이스로 돌려 본다 (C14 시험 케이스 형식).

**화면을 모른다.** 설계 도구(Studio)와 서버 실행기의 「시험 모드」가 같은 코드를 쓰고,
미는 일(`CaseRun.pump()`)과 알리는 일(`Listener`)만 부르는 쪽이 정한다
([ADR-0143](../../../../../../docs/decisions/0143-design-happens-in-the-console.md)).

| 모듈 | 하는 일 |
| --- | --- |
| `workspace` | 작업 폴더 한 벌 (`BpmProcess`·`Definition`) — 그림·결정표·케이스·`libs/`·재생 기억 |
| `cases` | 케이스 값 다루기·검증 (엔진과 **같은 `validate_answer`**) |
| `variables` | 그림이 만드는 변수와 고를 거리 이름 |
| `packaging` | 매니페스트를 그림에서 모으고 패키지 zip을 짓는다 (C1·C2) |
| `receiver` | 시험 수신기 — 웹훅이 **바깥에 나가지 않게** 받는 자리 (C14 `$test_receiver`) |
| `readiness` | 실행 전 사전 점검을 `Violation`으로 옮긴다 |
| `runner` | 케이스 하나를 엔진에 물려 돌린다 |
| `settings` | 시험 실행 한 번이 바깥 세계에 닿는 데 필요한 값 |
"""

from __future__ import annotations

from bpm.core.testrun.readiness import readiness
from bpm.core.testrun.receiver import Delivered, Receiver
from bpm.core.testrun.runner import (
    CaseDelegator,
    CaseRun,
    CaseSender,
    Listener,
    Outcome,
    Plan,
    Quiet,
    read_cases,
    resolve_inputs,
    summarize,
)
from bpm.core.testrun.settings import RunSettings
from bpm.core.testrun.workspace import BpmProcess, Definition, Workspace

__all__ = [
    "BpmProcess",
    "CaseDelegator",
    "CaseRun",
    "Definition",
    "Delivered",
    "Listener",
    "Outcome",
    "Plan",
    "Quiet",
    "Receiver",
    "RunSettings",
    "CaseSender",
    "Workspace",
    "read_cases",
    "readiness",
    "resolve_inputs",
    "summarize",
]
