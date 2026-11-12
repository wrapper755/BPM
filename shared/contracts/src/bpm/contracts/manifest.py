"""C1. 패키지 매니페스트 — 패키지 zip 루트의 `manifest.json`.

단일 원본: `docs/03-contracts/C1-package-manifest.md`. 검사 규칙은 `validate()`에 있고,
Studio(빌드)·Center(업로드)·서버 실행기(설치)가 **같은 함수**를 쓴다.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import Field

from bpm.contracts._base import ContractModel, SchemaVersioned, Sha256, Timestamp, Violation
from bpm.contracts.organization import KNOWN_PLACE_SCOPES, Place

PackageKind = Literal["bpm_process", "process_lib"]

KNOWN_TRIGGER_KINDS = frozenset({"none", "message", "timer", "conditional", "signal"})
#: 실행하는 쪽이 갖춰야 할 설정 이름 (C1 `requires.settings`).
SETTING_LLM = "llm"
SETTING_VLM = "vlm"
SETTING_SMTP = "smtp"
KNOWN_SETTINGS = frozenset({SETTING_LLM, SETTING_VLM, SETTING_SMTP})
#: `built.by`의 아는 값. **검사하지 않는다** — 남의 도구로 만든 올바른 패키지를 거부하게
#: 되므로 **열린 문자열이 맞다** (`settings`와 다르다: 그쪽은 우리가 아는 것만 점검할 수 있어
#: R11이 막는다). 화면이 「studio로 만듦」처럼 풀어 쓸 때 쓰는 목록이다.
KNOWN_BUILT_BY = frozenset({"studio", "cli"})

#: AI 태스크의 대상 환경 — C14 `bpm:aiTask.domain`과 C1 `requires.domains`가 **같은 목록**이다.
#: 거르는 자리는 둘이지만(C14 B8이 그림에서, R2가 매니페스트에서) **정의는 여기 하나**다.
#: 자리가 C1 쪽인 것은 층 때문이다 — `bpmn_ext`가 이 모듈을 import한다 (거꾸로는 순환이다).
KNOWN_DOMAINS = frozenset({"llm", "api", "doc", "web", "desktop"})

#: 서버에서 돌 수 없는 AI 태스크 대상 환경 (R2·C14 B6, `core`의 사전 점검·AI 태스크도 본다).
PC_ONLY_DOMAINS = frozenset({"web", "desktop"})

PackageId = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,99}$")]
SemVer = Annotated[str, Field(pattern=r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")]


class Trigger(ContractModel):
    """시작 방법 — 진입 정의의 시작 이벤트 하나를 옮긴 것.

    `kind`는 `KNOWN_TRIGGER_KINDS` 중 하나다. 타입이 아니라 **R9**가 검사한다 — 위반에
    `unknown_trigger_kind` 코드를 붙여 Studio·Center가 같은 문구로 말하려고 (R4와 같은 결).

    **이름과 식은 다른 칸이다** — `name`은 이벤트 이름(C12 메시지 API가 이 이름으로 보낸다),
    `expression`은 타이머 식(`timeCycle`의 cron·ISO)이다. 한 칸에 담으면 읽는 쪽이 타이머
    트리거의 `name`을 메시지 이름으로 읽는다.
    """

    kind: str
    name: str | None = None  # 이벤트 이름 (`message`는 메시지 이름, `signal`은 신호 이름)
    expression: str | None = None  # 타이머 식 (`timer`만)


class ManifestInput(ContractModel):
    """진입 정의가 받는 입력 하나 — `bpm:process.inputs`를 옮긴 것 (C1). 작업 지시 화면이 칸을 그린다."""

    name: str
    type: str  # C14 VALUE_TYPES
    required: bool = False
    description: str | None = None
    default: Any = None
    #: **값 출처** (C14, ADR-0099) — 비우면 부르는 쪽. 있으면 Center가 넣으므로 작업 화면이 칸을
    #: 그리지 않고, 그 이름이 작업 `inputs`에 오면 Center가 거절한다 (C5 `input_not_from_caller`).
    source: str | None = None


class ServiceAppNeed(ContractModel):
    """부르는 서비스 앱(= C15 토픽)과 작업. **키도 키 참조도 없다** (ADR-0102).

    옛 패키지의 `key_ref`·`task_key_refs`는 모르는 칸으로 받아 두고 보지 않는다 (원칙 3).
    """

    app_id: str
    operations: list[str]


class ResourceRef(ContractModel):
    """확장이 기여한 자원 중 쓰는 것 (예: `{type: "ui_page", id: "erp.order.form"}`)."""

    type: str
    id: str


class ExtensionNeed(ContractModel):
    """쓰는 확장과 버전 범위 (C13). 외부 확장은 `definition_hash`로 정의를 고정한다."""

    id: str
    version: str
    definition_hash: str | None = None


class TaskTypeNeed(ContractModel):
    """확장이 기여한 태스크 종류 (C13). 배포 때 그 확장이 깔려 있나를 Center가 본다."""

    id: str
    extension: str


class Requires(ContractModel):
    """실행에 필요한 것. 모두 선택이고, 없으면 "제한 없음"이다."""

    core: str | None = None
    tools: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    settings: list[str] = Field(default_factory=list)
    service_apps: list[ServiceAppNeed] = Field(default_factory=list)
    resources: list[ResourceRef] = Field(default_factory=list)
    extensions: list[ExtensionNeed] = Field(default_factory=list)
    task_types: list[TaskTypeNeed] = Field(default_factory=list)
    libs: list[str] = Field(default_factory=list)
    #: **맡기는** BPM 프로세스 (`<id>@<version>` 또는 `<id>` — 판을 비우면 배포된 판,
    #: ADR-0082). `libs`와 다르다: 복사해 넣는 것이 아니라 **따로 올리고 따로 배포한
    #: BPM 프로세스**이다.
    delegations: list[str] = Field(default_factory=list)
    #: **PC 위임**으로 부르는 PC BPM 프로세스 (`<id>@<version>` 또는 `<id>` — 판을 비우면 배포된 판,
    #: [ADR-0062](../decisions/0062-pc-delegation.md)). `libs`와 다르다: 복사해 넣는 것이
    #: 아니라 **따로 올리고 따로 배포한 BPM 프로세스**이다.
    runtimes: list[str] = Field(default_factory=list)
    os: list[str] = Field(default_factory=list)


class HumanNeeds(ContractModel):
    """사람 개입 종류 — 결재와 확인 (C6). 둘 다 Center 결재함에서 답한다 (ADR-0144)."""

    approval_center: bool = False
    confirmation: bool = False


class Built(ContractModel):
    """누가 언제 무엇으로 빌드했나."""

    by: str  # 열린 문자열 (KNOWN_BUILT_BY)
    at: Timestamp
    core: str
    spec_version: int


class ProvidedProcess(ContractModel):
    """`process_lib`이 제공하는 공유 BPM 프로세스 하나."""

    process_id: str
    file: str
    name: str | None = None
    description: str | None = None
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    ai_tasks: int | None = None
    human: HumanNeeds | None = None


class Provides(ContractModel):
    processes: list[ProvidedProcess] = Field(default_factory=list)


class Manifest(SchemaVersioned):
    """패키지 매니페스트 (C1 최상위)."""

    kind: PackageKind
    id: PackageId
    version: SemVer
    name: str | None = None
    description: str | None = None
    #: **업무 자리** (C16, ADR-0127) — Studio가 올릴 때 고른다. 비우면 회사 공통이다. 회사는 올린 Studio의 것이다.
    place: Place | None = None
    entry: str | None = None
    process_id: str | None = None
    triggers: list[Trigger] = Field(default_factory=list)
    requires: Requires
    human: HumanNeeds
    inputs: list[ManifestInput] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    provides: Provides | None = None
    built: Built
    content_hash: Sha256


def _check_r1(m: Manifest) -> list[Violation]:
    out = []
    if m.kind == "bpm_process":
        missing = [f for f in ("entry", "process_id") if getattr(m, f) is None]
        if missing:
            out.append(Violation(rule="R1", message="bpm_process에 필수 필드가 없다", items=missing))
    return out


def _check_r2(m: Manifest) -> list[Violation]:
    """서버에서 할 수 없는 것 (C1 R2). 실행 자리가 서버 하나가 되면서 **웹·데스크톱 AI
    태스크만** 남았다 — 그 판은 아직 돌릴 수 없다 (ADR-0114·ADR-0144).
    """
    items = [f"domains:{d}" for d in m.requires.domains if d in PC_ONLY_DOMAINS]
    if not items:
        return []
    return [
        Violation(
            rule="R2",
            code="server_incompatible",
            message="서버에서 할 수 없는 것이 있다",
            items=items,
        )
    ]


def _check_r12(m: Manifest) -> list[Violation]:
    """**자기 자신에게 위임하지 않는다** (C1 R12, ADR-0082).

    끝나지 않는 되부름이다 — 위임은 결과를 기다리므로 한 건이 같은 BPM 프로세스를 또 기동하고 그것이
    또 기동한다. 그림은 자기 패키지 id를 모르므로 **매니페스트가 본다** (`id`와
    `requires.delegations`가 한 자리에 있다).
    """
    mine = [one for one in m.requires.delegations if one.split("@", 1)[0] == m.id]
    if not mine:
        return []
    return [
        Violation(
            rule="R12",
            code="delegation_to_self",
            message="자기 자신에게 위임할 수 없다 (끝나지 않는 되부름이다)",
            items=sorted(mine),
        )
    ]


def _check_r9(m: Manifest) -> list[Violation]:
    """시작 방법의 `kind`가 계약에 적힌 다섯 중 하나인가 (C1 R9).

    **「모르는 것」으로 보고 넘기지 않는다** — 시작 방법은 사람이 적는 값이 아니라 그림에서
    기계가 옮기는 값이라, 모르는 이름이 들어왔다면 옮기는 쪽의 흠이다. 경고로 두면 읽는 쪽이
    `timer`를 기다리며 아무 말 없이 영영 못 만난다.
    """
    bad = sorted({t.kind for t in m.triggers if t.kind not in KNOWN_TRIGGER_KINDS})
    if not bad:
        return []
    return [
        Violation(
            rule="R9",
            code="unknown_trigger_kind",
            message="triggers[].kind가 계약에 없는 값이다 "
            f"(아는 값: {', '.join(sorted(KNOWN_TRIGGER_KINDS))})",
            items=bad,
        )
    ]


def _check_r13(m: Manifest) -> list[Violation]:
    """타이머 시작의 식을 **Center가 읽을 수 있나** (C1 R13, ADR-0110).

    R9와 같은 까닭이다 — 일정은 Center가 이 식으로 쓴다(`contracts.schedule`). 읽지 못하는 식을
    받아 두면 그 BPM 프로세스는 **아무 말 없이 영영 돌지 않는다**. 읽는 함수가 같아야 「올라갔는데 안 돈다」가
    없다.
    """
    from bpm.contracts.schedule import cycle_problem  # noqa: PLC0415 — 쓰는 자리에서만

    bad = [
        f"{t.expression or ''}: {problem}"
        for t in m.triggers
        if t.kind == "timer" and (problem := cycle_problem(t.expression or "")) is not None
    ]
    if not bad:
        return []
    return [
        Violation(
            rule="R13",
            code="timer_expression_invalid",
            message="타이머 시작의 식을 읽을 수 없다 (5필드 cron 또는 ISO R/…, C14 §이벤트)",
            items=bad,
        )
    ]


def _check_r14(m: Manifest) -> list[Violation]:
    """업무 자리는 BPM 프로세스에만 있고 아는 범위다 (C1 R14, ADR-0127).

    칸과 범위가 맞는지는 `Place` 모델이 읽을 때 본다. 부서·직원이 **올린 회사 안에** 있는지는 조직을
    아는 Center가 올릴 때 본다(`organization.place_violation`) — 매니페스트만으로는 알 수 없다.
    """
    if m.place is None:
        return []
    if m.kind != "bpm_process":
        return [Violation(rule="R14", code="place_not_for_lib", message=f"kind={m.kind}에는 업무 자리를 두지 않는다")]
    if m.place.scope not in KNOWN_PLACE_SCOPES:
        return [Violation(rule="R14", code="input_invalid", message=f"모르는 업무 자리 범위다: {m.place.scope}")]
    return []


def _check_r11(m: Manifest) -> list[Violation]:
    """`requires.settings`가 계약에 적힌 것 중 하나인가 (C1 R11).

    **R9와 같은 까닭이다** — 갖춰야 할 설정은 사람이 적는 값이 아니라 **그림에서 Studio가
    옮기는 값**이고(`bpm:email` → `smtp`), 읽는 쪽은 그 이름으로 「이 호스트가 갖췄나」를 본다
    (`core.preflight`). 모르는 이름이 들어오면 그 점검은 **아무 말 없이 지나가** 준비되지 않은
    BPM 프로세스가 실행되고 그 태스크에서 죽는다. R9를 만들기 전 `triggers[].kind`가 겪은 그 꼴이다.

    열어 두지 않는 것은 **우리가 아는 설정만 점검할 수 있어서**다 — `built.by`처럼 남이 적을
    수 있는 값이 아니다 (그쪽은 열린 문자열이 맞다).
    """
    bad = sorted({one for one in m.requires.settings if one not in KNOWN_SETTINGS})
    if not bad:
        return []
    return [
        Violation(
            rule="R11",
            code="unknown_setting",
            message="requires.settings가 계약에 없는 값이다 "
            f"(아는 값: {', '.join(sorted(KNOWN_SETTINGS))})",
            items=bad,
        )
    ]


def _check_r6(m: Manifest, computed_hash: str | None) -> list[Violation]:
    if computed_hash is None or computed_hash == m.content_hash:
        return []
    return [
        Violation(
            rule="R6",
            code="hash_mismatch",
            message=f"content_hash가 실제 내용과 다르다 (매니페스트 {m.content_hash}, 계산값 {computed_hash})",
        )
    ]


def validate(
    m: Manifest,
    *,
    computed_hash: str | None = None,
) -> list[Violation]:
    """C1 검사 규칙. 위반 목록을 돌려준다 (비어 있으면 통과).

    인자를 주지 않으면 **매니페스트 하나만 보고 할 수 있는 검사**만 한다.

    - `computed_hash`: 패키지 실물에서 계산한 해시. 없으면 R6을 건너뛴다.
      폴더면 `bpm.contracts.hashing.content_hash_dir(root)`, zip이면 `content_hash_zip(path)`.

    여기서 하지 않는 것:
    - **R5** (키 값·비밀이 없음) — Studio 빌드가 보장한다 (C1 검사 규칙 표).
    - **R8** (서버 배포 때 작업이 `server_ok`·결정 수행인지) — Center가 배포 시점에 C11 manifest·
      리소스 목록(C7)과 대조한다. 매니페스트만으로는 알 수 없다.
    """
    return [
        *_check_r1(m),
        *_check_r2(m),
        *_check_r6(m, computed_hash),
        *_check_r9(m),
        *_check_r11(m),
        *_check_r12(m),
        *_check_r13(m),
        *_check_r14(m),
    ]
