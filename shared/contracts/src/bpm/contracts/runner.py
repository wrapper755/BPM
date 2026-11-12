"""C4. Center API: 실행기 등록·하트비트 — 공통 모델과 규칙.

단일 원본: `docs/03-contracts/C4-runner-center.md`.

**경로는 실행기마다 제 계약에 있다** — 지금 실행기는 서버 실행기 하나이고 그 경로·등록·하트비트
본문은 C12(`bpm.contracts.server_runner`)다. 여기에는 **여러 쪽이 함께 쓰는 것**만 둔다:
작업 내려주기·ack, 배포 결과, 준비 상태, 확장 상태, 결재 전달, 그리고 키 묶기·하트비트 간격 같은
수치. Center의 작업·결재·배포 API도 이 모델로 말한다.

한 가지가 계약으로 강제된다.

- **상태 값은 열린 문자열.** 모르는 값 하나로 하트비트 전체를 422로 거부하지 않는다
  (프로토타입 결함). 알려진 값은 `KNOWN_*`로만 둔다.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from bpm.contracts._base import ContractModel, Timestamp
from bpm.contracts.organization import PlaceIdentity

#: 하트비트 기본 간격과 온라인 판정 (CON-12).
DEFAULT_HEARTBEAT_S = 30
ONLINE_WITHIN_S = 90

MachineId = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
"""그 기계 고유값의 SHA-256. **원값은 보내지 않는다.**"""

# 알려진 값 (모두 열린 문자열).
#: 실행이 시작된 까닭. C3와 같은 목록이다.
#: **`delegation`은 맡아서 받은 작업**이다 (ADR-0082).
KNOWN_SOURCES = frozenset({"job", "manual", "watch", "schedule", "message", "delegation"})
KNOWN_JOB_ACK_RESULTS = frozenset({"queued", "started", "rejected", "expired", "cancelled", "cancel_refused"})
KNOWN_JOB_ACK_REASONS = frozenset({"queue_full", "no_deployment", "not_ready", "already_started"})
KNOWN_DEPLOYMENT_RESULTS = frozenset({"applied", "rejected"})
KNOWN_APPROVAL_STATES = frozenset({"answered", "expired", "withdrawn"})


class BuildStamp(ContractModel):
    """묶은 산출물의 표시 (C12 `versions.build`, [ADR-0067](../../../../../docs/decisions/0067-build-stamp.md)).

    **있으면 묶은 것에서 돈다.** 없으면 묶지 않은 것(소스·`uv sync`)이다 — 「모른다」가 아니다.
    판 자체는 실행기의 `versions`에 있다(빌드가 찍은 것).
    """

    commit: str
    built_at: Timestamp


class ExtensionState(ContractModel):
    """설치된 확장 하나 (C13).

    **`enabled`와 `off`는 다른 것을 말한다** ([ADR-0043](../../../../../docs/decisions/0043-turned-off-extensions.md)):
    `off`는 **사람이 껐다**(멀쩡한데 일부러 안 쓴다), `enabled=false`인데 `off`가 아니면 **흠이
    있다**(정의·판이 맞지 않는다). 화면이 「꺼짐」과 「호환 안 됨」을 가르는 자리다.
    """

    id: str
    version: str
    definition_hash: str | None = None
    enabled: bool = True
    off: bool = False


class Readiness(ContractModel):
    """설치된 BPM 프로세스 하나의 준비 상태."""

    bpm_process_id: str
    version: str
    ready: bool
    missing_key_refs: list[str] = Field(default_factory=list)
    blocked: list[str] = Field(default_factory=list)


class JobAck(ContractModel):
    """이번 주기에 처리한 작업 하나."""

    job_id: str
    result: str  # 열린 문자열 (KNOWN_JOB_ACK_RESULTS)
    position: int | None = None  # queued일 때 대기열 순번
    run_id: str | None = None  # started일 때
    reason: str | None = None  # rejected·cancel_refused일 때 (KNOWN_JOB_ACK_REASONS)
    #: **맡긴 BPM 프로세스가 돌려주는 값** (C12 §맡기기, ADR-0082). 원칙 6의 **명시한
    #: 예외**라 좁게 쓴다: **그 BPM 프로세스가 선언한 `outputs`만**(C1), **끝났을 때만**,
    #: 그리고 **맡아서 받은 작업만**이다. 평범한 작업은 비운다 — Center는 맡기기가 아닌
    #: 작업의 `outputs`를 **버린다**.
    outputs: dict[str, Any] = Field(default_factory=dict)


class ApprovalAck(ContractModel):
    request_id: str
    accepted: bool
    reason: str | None = None


class DeploymentResult(ContractModel):
    """배포 적용 결정 (CON-12 「최근 배치 결정」). 실행이 아니므로 C3로 보내지 않는다."""

    deployment_id: str
    bpm_process_id: str
    version: str
    result: str  # 열린 문자열 (KNOWN_DEPLOYMENT_RESULTS)
    at: Timestamp
    reason: str | None = None


class JobDispatch(ContractModel):
    """내려온 작업 하나. ack가 올 때까지 매번 실린다."""

    job_id: str
    bpm_process_id: str
    version: str | None = None  # 없으면 배포된 버전
    inputs: dict[str, Any] = Field(default_factory=dict)
    requested_by: str  # 사람
    requested_at: Timestamp
    expires_at: Timestamp | None = None
    note: str | None = None
    #: **작업의 주인** — 그 BPM 프로세스의 업무 자리를 Center가 내려줄 때 붙인다 (C12·C16, ADR-0125 §4).
    #: 저장하지 않는다. 출처가 `company.*`·`department.*`·`staff.*`인 입력의 값이 된다.
    place: PlaceIdentity | None = None


class ApprovalDispatch(ContractModel):
    """답이 정해진 결재 (C6)."""

    request_id: str
    state: str  # 열린 문자열 (KNOWN_APPROVAL_STATES)
    answer: Any = None
    answered_by: str | None = None
    answered_at: Timestamp | None = None
    answered_via: str | None = None  # 대리 답이면 그 키 이름 (C6, ADR-0081) — C3 human_answered에 남긴다
