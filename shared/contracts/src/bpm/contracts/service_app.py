"""C11. 서비스 앱 공통 — 모든 서비스 앱이 지키는 계약.

단일 원본: `docs/03-contracts/C11-service-app-common.md`. 구현 뼈대는 `server/service_kit/`.

**서비스 앱은 확장의 서버 부분이고 일꾼이다** (ADR-0018·ADR-0102). 업무 호출은 C15 외부 작업으로
오고 앱은 HTTP로 업무 호출을 받지 않는다 — 앱 안의 키도 없다(「불러도 되나」는 Center가 배포로 가린다).

- **수행 모드는 받는 쪽이 바꾸지 않는다** (README 원칙 7). 유일한 예외가 폴백이고, 그것도
  **시험 일감(`origin: test`)일 때만** 일어나며 결과 `mode_used`로 드러난다.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field, model_validator

from bpm.contracts._base import ContractModel, SchemaVersioned, Timestamp, Violation

#: 기본값들.
DEFAULT_TIMEOUT_S = 60
MAX_BODY_MB = 1
IDEMPOTENCY_DAYS = 7

#: 수행 모드 (ADR-0010).
MODE_AUTONOMOUS = "autonomous"
MODE_DETERMINISTIC = "deterministic"
MODES = frozenset({MODE_AUTONOMOUS, MODE_DETERMINISTIC})

#: 일꾼 종류 (ADR-0135) — 작업이 어떤 일인가. 토픽(앱 id)과 권한은 바꾸지 않고 보이는 데만 쓴다.
KIND_AI = "ai"  # AI 작업 — 모델을 부르고 출력을 검증한다 (C11 「AI 작업」)
KIND_API = "api"  # 외부 시스템 API 호출
KIND_RPA = "rpa"  # 화면 조작 — 자리만 있다 (처리하는 일꾼이 없다)
KINDS = frozenset({KIND_AI, KIND_API, KIND_RPA})

#: 작업 이름 규칙.
OPERATION_PATTERN = r"^[a-z][a-z0-9_]{0,63}$"

KNOWN_CALLER_TYPES = frozenset({"bot_ui", "server_runner", "studio"})
KNOWN_CATEGORIES = frozenset({"business", "system"})
KNOWN_HEALTH_STATUSES = frozenset({"ok", "degraded"})

#: 실패 코드 중 다시 해 볼 만한 것 (C11 §오류 — 부르는 쪽 재시도가 이것에 걸려 있다).
RETRY_CODES = frozenset({"rate_limited", "dependency_down", "timeout"})

OperationName = Annotated[str, Field(pattern=OPERATION_PATTERN)]


class HealthResponse(ContractModel):
    """`GET /healthz` — 인증 없음."""

    status: str  # KNOWN_HEALTH_STATUSES
    version: str | None = None
    reasons: list[str] = Field(default_factory=list)  # degraded면 이유 (예: neo4j_unreachable)


class AppGroup(ContractModel):
    """연결 앱 목록(CON-17)에서 앱을 묶는 자리 — Camunda 요소 템플릿의 `category{id, name}` (ADR-0137).

    C11 `category`(업무용·시스템용)와는 다른 칸이다. C13 정의·C11 manifest가 같은 모양을 쓴다.
    """

    id: str
    name: str


class OperationGroup(ContractModel):
    """앱 안 작업 묶음 하나 (C13 `adapter.groups`·C11 `groups`, OpenAPI 최상위 `tags`와 같은 결 — ADR-0137).

    적힌 순서가 보이는 순서다. 실행에는 쓰이지 않는다.
    """

    id: str
    name: str
    description: str | None = None


def group_problems(groups: list[OperationGroup], operations: list[Any]) -> list[str]:
    """묶음 id가 겹치거나 작업이 없는 묶음을 가리키면 그 사유들 (C13 E3·C11 모델 검사가 함께 쓴다)."""
    out: list[str] = []
    known: set[str] = set()
    for one in groups:
        if one.id in known:
            out.append(f"묶음 id가 겹친다: {one.id}")
        known.add(one.id)
    for op in operations:
        if op.group is not None and op.group not in known:
            out.append(f"groups에 없는 묶음이다: {op.name} → {op.group}")
    return out


class Operation(ContractModel):
    """작업 하나. Studio가 이것만 보고 서비스 앱 태스크 편집기(STU-14)를 만든다."""

    name: OperationName
    description: str | None = None
    modes: list[str] = Field(default_factory=list)  # MODES
    # 기본 none — 운영에서 LLM이 몰래 개입하지 않게 (CLAUDE.md §5).
    fallback: str = "none"
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    timeout_s: int = DEFAULT_TIMEOUT_S
    server_ok: bool = True  # 서버 실행기에서 불러도 되는가 (C1 R8)
    #: 이 작업을 부르려면 키에 있어야 하는 추가 권한 (키의 `extra_scopes`).
    #: **작업이 선언하고 뼈대가 건다** — 작업 함수가 키를 들여다보지 않는다.
    required_scopes: list[str] = Field(default_factory=list)
    #: 일꾼 종류 (`KINDS`, ADR-0135). Center가 일감에 옮겨 적는다 (C15 `LockedTask.kind`).
    kind: str = KIND_AI  # 열린 문자열 — 아는 값은 `KINDS` (원칙 10)
    #: 묶음 (manifest `groups[].id`) — 연결 앱 화면(CON-17)이 묶는다 (ADR-0137).
    group: str | None = None
    #: 찾기용 낱말 (CON-17).
    keywords: list[str] = Field(default_factory=list)

    def supports(self, mode: str) -> bool:
        return mode in self.modes


class ExtensionRef(ContractModel):
    """이 서비스 앱이 어느 확장의 서버 부분인가 (C13). 내장·사내 확장이면 넣는다."""

    id: str
    version: str


class ResourceCatalog(ContractModel):
    """이 앱이 **자기 기여 자원 카탈로그**를 내는 종류 (C7 §리소스 모으는 방식).

    **내장·사내 확장의 정의는 Center에 없어**(설치 파일에 들어 있다) 서버 부분이 자기 카탈로그를
    알린다 — 일꾼이 `PUT /consumers/self/catalogs/{type}`으로 올린다 (C15, ADR-0102). 응답 형식은
    C13 §5 `Catalog`다. `catalog_url`은 옛 manifest를 읽기 위해 남은 칸이고 Center는 그 주소를 부르지 않는다.
    """

    type: str  # 자원 종류 (예: ui_page). 확장이 정한다
    catalog_url: str  # 옛 칸 — Center는 부르지 않는다 (`/`로 시작)
    label: str | None = None  # 화면에 보일 이름 (CON-07 탭 제목)


class ServiceAppManifest(SchemaVersioned):
    """앱이 하는 일 — 일꾼이 `PUT /consumers/self/manifest`로 올리고 Center가 리소스 목록·작업 대조에 쓴다 (C7·C15)."""

    app_id: str
    name: str
    version: str
    category: str  # KNOWN_CATEGORIES
    console_url: str
    operations: list[Operation] = Field(default_factory=list)
    extension: ExtensionRef | None = None
    #: 이 앱이 주는 기여 자원 카탈로그 (C7 — Center가 읽어 리소스 목록에 싣는다).
    resources: list[ResourceCatalog] = Field(default_factory=list)
    #: 연결 앱 목록(CON-17)에서 이 앱을 묶는 자리 (ADR-0137). `category`와 다른 칸이다.
    app_group: AppGroup | None = None
    keywords: list[str] = Field(default_factory=list)
    #: 작업 묶음 — 작업의 `group`이 가리킨다. 없는·겹치는 id는 모델 검사가 거부한다.
    groups: list[OperationGroup] = Field(default_factory=list)

    @model_validator(mode="after")
    def _groups_match(self) -> ServiceAppManifest:
        problems = group_problems(self.groups, self.operations)
        if problems:
            raise ValueError("; ".join(problems))
        return self

    def operation(self, name: str) -> Operation | None:
        return next((o for o in self.operations if o.name == name), None)


class Caller(ContractModel):
    """누가 부르는가. `type`은 열린 문자열 (KNOWN_CALLER_TYPES)."""

    type: str
    host: str | None = None
    bpm_process_id: str | None = None
    version: str | None = None


class Usage(ContractModel):
    """LLM 사용량. 이름은 C3 `llm_usage`와 같다. **금액은 넣지 않는다.**"""

    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class OpRequest(SchemaVersioned):
    """작업 함수가 받는 요청 — 일꾼 뼈대가 C15 `LockedTask`에서 짓는다 (C11 §OpRequest)."""

    mode: str  # MODES. **받는 쪽은 바꾸지 않는다** (원칙 7)
    run_id: str
    node_id: str
    node_instance: int = Field(ge=1)  # 이 실행에서 이 노드의 몇 번째 실행인가
    attempt: int = Field(ge=1)  # 재시도마다 +1
    call_seq: int = Field(default=1, ge=1)  # 한 노드 인스턴스·시도 안에서 여러 번 부를 때
    caller: Caller
    business_key: str | None = None  # 여러 호출을 한 업무로 잇는 키 (선택)
    input: dict[str, Any] = Field(default_factory=dict)
    #: `run` | `test` — 시험 일감이면 앱이 시험 쪽으로 보낼지 정한다 (C15, ADR-0102 §6).
    origin: str = "run"


class OpResponse(ContractModel):
    """작업 함수의 결과 — 뼈대가 C15 `complete`로 옮긴다."""

    status: str = "ok"
    output: dict[str, Any] = Field(default_factory=dict)
    mode_used: str  # 폴백이 일어났을 때만 요청의 `mode`와 다르다
    replayed: bool = False  # 이전 호출 결과를 돌려준 것인가 (멱등)
    usage: Usage | None = None


class UsageRecord(ContractModel):
    """사용 기록 한 줄 (앱 안, SVC-03). **입력·출력 값은 기록하지 않는다.**"""

    at: Timestamp
    #: 부른 쪽 — `<caller.type>:<caller.host>` (키가 없어졌다, ADR-0102).
    key_name: str
    operation: str
    mode: str
    status: int  # 200 = 끝냄, 그 밖은 실패 (C11 §오류의 코드에 맞춘 수)
    duration_ms: int
    run_id: str | None = None
    caller_type: str | None = None
    usage: Usage | None = None
    #: 일감의 토픽 — 통합 일꾼에서만 채운다 (`OperationStatus.topic`과 같은 규칙).
    topic: str | None = None


IdempotencyKey = tuple[str, str, str, int, int, int]
"""`(operation, run_id, node_id, node_instance, attempt, call_seq)` — C11 멱등 키."""


def idempotency_key(operation: str, req: OpRequest) -> IdempotencyKey:
    """멱등 키. 같은 키로 다시 오면 수행하지 않고 저장된 결과를 돌려준다 (`replayed: true`).

    **부르는 쪽은 재시작 뒤에도 `node_instance`·`attempt`·`call_seq`를 같은 값으로 다시 만들
    수 있어야 한다.** 그래야 같은 키로 다시 불러도 한 번만 수행된다 (README 원칙 9). 서버
    실행기는 기다릴 때 실행 상태를 담고 되살려 셋이 **저절로** 같은 값이 되게 한다 (ADR-0054).
    """
    return (operation, req.run_id, req.node_id, req.node_instance, req.attempt, req.call_seq)


def resolve_mode(op: Operation, *, requested: str, origin: str = "run") -> tuple[str | None, Violation | None]:
    """실제로 쓸 모드를 정한다. `(모드, None)` 또는 `(None, 위반)`.

    - 작업이 요청한 모드를 지원하면 그대로 쓴다 (받는 쪽은 모드를 바꾸지 않는다).
    - 지원하지 않으면 `mode_unsupported` (422). **단 하나의 예외**가 폴백이다:
      결정 수행을 요청했는데 작업이 `fallback="autonomous"`이고 **시험 일감이면**(`origin: test` —
      Studio 시험 실행) 자율 수행으로 넘어간다. 현장 일감이면 폴백하지 않고 실패한다.
    """
    if op.supports(requested):
        return requested, None
    if (
        requested == MODE_DETERMINISTIC
        and op.fallback == MODE_AUTONOMOUS
        and op.supports(MODE_AUTONOMOUS)
        and origin == "test"
    ):
        return MODE_AUTONOMOUS, None
    return None, Violation(
        rule="C11",
        code="mode_unsupported",
        message=f"작업 {op.name}은 {requested} 수행을 지원하지 않는다",
        items=sorted(op.modes),
    )


# ─────────────────────────── 관리 API (`/admin/v1/*`, SVC-00~03) ───────────────────────────

#: 의존 상태 (SVC-01). 열린 문자열이고 알려진 값은 이것들이다.
KNOWN_DEPENDENCY_STATUSES = frozenset({"ok", "degraded", "unreachable", "unknown"})


class OperationStatus(ContractModel):
    """작업 하나의 선언 + 최근 통계 (SVC-01 「작업」). 수는 앱 안의 사용 기록에서 센다."""

    name: str
    description: str | None = None
    modes: list[str] = Field(default_factory=list)
    fallback: str = "none"
    server_ok: bool = True
    #: 일꾼 종류 (`Operation.kind`, ADR-0135).
    kind: str = KIND_AI
    #: 그 작업의 토픽 — **토픽 여럿을 맡는 일꾼**(통합 일꾼)에서만 채운다. 서비스 앱 하나면 비어 있다.
    topic: str | None = None
    calls_24h: int = 0
    errors_24h: int = 0
    #: 0.0~1.0. 호출이 없으면 0.
    error_rate: float = 0.0


class Dependency(ContractModel):
    """바깥 의존 하나 (SVC-01 「의존」) — 예: Neo4j, LLM 게이트웨이."""

    name: str
    status: str  # KNOWN_DEPENDENCY_STATUSES
    detail: str | None = None


class CenterRegistration(ContractModel):
    """Center 리소스 목록(C7)에 올라가 있나 (SVC-01 「Center 등록」)."""

    registered: bool = False
    base_url: str | None = None
    last_reported_at: Timestamp | None = None


class AdminStatus(SchemaVersioned):
    """`GET /admin/v1/status` (SVC-01). **관리자 토큰으로만** 부른다."""

    app_id: str
    name: str
    version: str
    category: str
    console_url: str | None = None
    #: 어느 확장의 서버 부분인가 (manifest와 같은 값). **관리 콘솔이 이것으로 그 확장의 고유
    #: 화면(C13 `console.pages`)을 고른다** — 콘솔 한 벌이 모든 앱을 그린다 (ADR-0042).
    extension: ExtensionRef | None = None
    started_at: Timestamp
    uptime_s: int = 0
    operations: list[OperationStatus] = Field(default_factory=list)
    dependencies: list[Dependency] = Field(default_factory=list)
    center: CenterRegistration = Field(default_factory=CenterRegistration)


class UsagePage(ContractModel):
    """`GET /admin/v1/usage` (SVC-03). 최근 것부터. **입력·출력 값은 없다** (계약 원칙 6)."""

    items: list[UsageRecord] = Field(default_factory=list)
    total: int = 0


