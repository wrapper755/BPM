"""C17. Center API: 작업공간 — 콘솔이 서버의 BPM 프로세스 작업 폴더를 읽고 고친다.

단일 원본: `docs/03-contracts/C17-workspaces.md`.

**작업공간 하나 = BPM 프로세스 한 벌**이다
([ADR-0143](../../../../../docs/decisions/0143-design-happens-in-the-console.md)) —
새 개념이 아니라 데스크톱 Studio의 「다른 이름으로 저장」 단위가 이미 그것이었다.

여기 있는 것은 **전송 모양과 받는 쪽이 믿지 않는 규칙**이다. 돌리는 일(엔진·케이스·판정)은
`bpm.core.testrun`이고 Center는 그것을 알지 못한다 — `bpm-center`는 `bpm-core`를 의존하지 않는다
(01-architecture §5). 그래서 **시험 실행·검사·짓기는 모두 서버 실행기가 한다**
([ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)).

두 가지가 계약으로 강제된다.

- **경로는 받는 쪽이 믿지 않는다** — `check_file_path()`가 한 자리에서 본다. 보내는 쪽(콘솔)과
  받는 쪽(Center)이 **같은 함수**를 쓴다. 베끼면 한쪽이 느슨해지고 그 틈으로 `..`가 지나간다.
- **판정 글은 여기 있다** (`VERDICT_*`) — 엔진 쪽(`core.testrun.runner`)이 이것을 가져다 쓴다.
  두 벌을 두면 화면이 「통과」를 모르는 글자로 받는다.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from bpm.contracts._base import ContractModel, SchemaVersioned, Timestamp, Violation
from bpm.contracts.organization import Place

#: 시험 실행의 실행 id 앞자리 (C3). **운영 실행과 한눈에 갈린다** — 자리 셈도 이것으로 가른다
#: (`validate_heartbeat` — 칸을 따로 두면 두 값이 갈라진다, ADR-0146).
TEST_RUN_PREFIX = "test_"

#: 작업공간 id — **C1 매니페스트 `id`와 같은 규칙**이다 (배포 후보를 지을 때 그대로 쓴다).
WORKSPACE_ID_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,63}$"
WorkspaceId = Annotated[str, Field(pattern=WORKSPACE_ID_PATTERN)]

# ─────────────────────────── 알려진 값 ───────────────────────────

#: 시험 실행 한 번의 수행 모드 (C14 — Studio 개발 실행이 쓰던 그 둘이다).
MODE_AUTONOMOUS = "autonomous"
MODE_DETERMINISTIC = "deterministic"
KNOWN_TEST_MODES = frozenset({MODE_AUTONOMOUS, MODE_DETERMINISTIC})

#: 판정 글. **엔진이 이것을 가져다 쓴다** (`core.testrun.runner`의 `PASS`·`FAIL`…).
VERDICT_PASS = "통과"
VERDICT_FAIL = "실패"
VERDICT_NO_EXPECT = "비교 안 함"
VERDICT_STOPPED = "중지"
VERDICT_ERROR = "오류"
KNOWN_TEST_VERDICTS = frozenset(
    {VERDICT_PASS, VERDICT_FAIL, VERDICT_NO_EXPECT, VERDICT_STOPPED, VERDICT_ERROR}
)

#: 시험 실행의 상태. 열린 문자열이다 (C4와 같다 — 모르는 값으로 거부하지 않는다).
KNOWN_TEST_RUN_STATES = frozenset({"queued", "running", "waiting", "done", "failed", "cancelled"})

#: 캔버스가 노드를 칠하는 값 (CON-20).
KNOWN_NODE_STATES = frozenset({"running", "done", "failed", "waiting", "replayed"})

#: 지을 패키지 종류 (C1 `kind`). 같은 단추의 두 갈래다.
KNOWN_BUILD_KINDS = frozenset({"bpm_process", "process_lib"})

#: 짓기 한 번의 상태.
KNOWN_BUILD_STATES = frozenset({"queued", "building", "done", "failed"})

# ─────────────────────────── 경로 규칙 ───────────────────────────

#: 작업 폴더 뿌리에 **하나만** 있는 파일 (작업 폴더 기록).
PROCESS_JSON = "process.json"

#: 첫 칸 → 그 아래에서 받는 파일 이름의 끝. 빈 튜플은 「아무 이름이나」인데, 지금은 없다.
ALLOWED_SUFFIXES: dict[str, tuple[str, ...]] = {
    "process": (".bpmn", ".dmn"),
    "cases": (".cases.json",),
    "memory": ("specs.json",),
}

#: 쓸 수 없는 첫 칸과 그 사유. `libs/`는 **받아 둔 공유 BPM 프로세스**라 설치가 넣는다 (ADR-0048).
READ_ONLY_DIRS = {"libs": "받아 둔 공유 BPM 프로세스는 고칠 수 없다 — 설치로 바꾼다"}


def check_file_path(path: str) -> str | None:
    """작업 폴더 안 상대 경로가 §경로 규칙을 지키나 — **사유**를 돌려준다 (`None`이면 맞다).

    **받는 쪽이 경로를 믿지 않는다.** 콘솔(보내는 쪽)과 Center(받는 쪽)가 이 함수 하나를 쓴다 —
    베끼면 한쪽이 느슨해지고 그 틈으로 `..`가 지나간다. 사유는 422 `bad_path`의 `detail`이 된다.

    **파일 시스템을 보지 않는다** — 심볼릭 링크는 정말 쓰는 쪽이 본다 (여기서는 알 수 없다).
    """
    if not path or path != path.strip():
        return "경로가 비었거나 앞뒤에 빈칸이 있다"
    if "\\" in path:
        return r"경로는 `/`로 가른다 (`\`를 쓰지 않는다)"
    if path.startswith("/"):
        return "절대 경로는 받지 않는다"
    if len(path) > 2 and path[1] == ":":
        return "드라이브 문자는 받지 않는다"
    parts = path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return "빈 칸·`.`·`..`를 받지 않는다"
    if any("\x00" in part for part in parts):
        return "경로에 NUL이 있다"

    head = parts[0]
    if len(parts) == 1:
        if head == PROCESS_JSON:
            return None
        return f"뿌리에 둘 수 있는 것은 `{PROCESS_JSON}` 하나다"
    if head in READ_ONLY_DIRS:
        return READ_ONLY_DIRS[head]
    allowed = ALLOWED_SUFFIXES.get(head)
    if allowed is None:
        places = " · ".join(sorted(ALLOWED_SUFFIXES))
        return f"첫 칸은 {places} 중 하나여야 한다 (받은 것: `{head}`)"
    if not any(parts[-1].endswith(suffix) for suffix in allowed):
        return f"`{head}/` 아래는 {' · '.join(allowed)}로 끝나야 한다"
    return None


# ─────────────────────────── 작업공간 ───────────────────────────


class WorkspaceCreateRequest(SchemaVersioned):
    """`POST /api/v1/workspaces` — 빈 한 벌을 만든다.

    `company`를 비우면 **부르는 계정의 회사**다 (C16). 만든 뒤에는 바뀌지 않는다.
    """

    id: WorkspaceId
    name: str = Field(min_length=1, max_length=100)
    version: str = "0.1.0"
    description: str | None = None
    company: str | None = None
    place: Place | None = None


class WorkspaceUpdateRequest(SchemaVersioned):
    """`PATCH /api/v1/workspaces/{id}` — STU-06이 하던 일.

    **생략한 칸은 그대로 둔다.** 회사는 여기 없다 — 만들 때 정해진다.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    version: str | None = None
    description: str | None = None
    place: Place | None = None
    #: 진입 정의의 경로 (`process/<이름>.bpmn`).
    entry: str | None = None


class InstalledLibInfo(ContractModel):
    """받아 둔 공유 BPM 프로세스 하나 (`process.json`의 기록, ADR-0048).

    **파일 목록으로는 판을 알 수 없다** — `libs/`는 평평하고 이름이 `<id>__<이름>`이라 판이
    어디에도 없다. 그래서 기록을 읽어 싣는다.
    """

    id: str
    version: str
    #: 그 파일들이 주는 BPMN 프로세스 id (`calledElement`가 가리키는 것). **읽지 못한 정의는
    #: 여기 없다** — 호출할 수 없기 때문이고, B14가 그 말을 한다.
    processes: list[str] = Field(default_factory=list)


class WorkspaceInfo(ContractModel):
    """작업공간 하나 — `process.json`을 읽어 보인 것이다.

    **원본은 파일이다.** 담당자·태그처럼 매니페스트에 칸이 없는 값도 파일에는 그대로 남는다.
    """

    id: str
    name: str
    version: str
    description: str | None = None
    company: str
    #: 업무 자리 (C16 — 회사는 위 칸이다). 매니페스트 `place`로 그대로 간다 (ADR-0127).
    place: Place | None = None
    #: 없으면 아직 고르지 않았다 — 돌리거나 지을 수 없다 (422 `no_entry`).
    entry: str | None = None
    updated_at: Timestamp
    updated_by: str
    #: 이 작업공간의 **지금 묶음 해시** — 파일이 하나라도 바뀌면 달라진다. 검사 캐시의 열쇠이고
    #: 실행기가 묶음을 집어 갈 때 적는 값이다 (C17 §내려보내기).
    revision: str
    #: 받아 둔 공유 BPM 프로세스 (§공유 BPM 프로세스 설치). 배포 후보를 지을 때 `requires.libs`로 간다.
    libs: list[InstalledLibInfo] = Field(default_factory=list)


class FileInfo(ContractModel):
    """작업 폴더 안 파일 하나 (탐색기가 그린다)."""

    path: str
    size_bytes: int = Field(ge=0)
    #: **내용 해시**다 (C2 `content_hash`와 같은 셈). 고칠 때 `If-Match`로 되돌려 보낸다.
    revision: str
    updated_at: Timestamp
    updated_by: str


class LibInstallRequest(SchemaVersioned):
    """`POST /api/v1/workspaces/{id}/libs` — 공유 BPM 프로세스를 `libs/`에 푼다 (ADR-0048)."""

    package_id: str
    version: str


# ─────────────────────────── 결정표 ───────────────────────────


class DecisionInputInfo(ContractModel):
    """입력 열 하나. **이름은 `expression`**(`inputExpression` 본문)이고 `label`은 사람이 읽는 이름이다."""

    id: str = ""
    expression: str = ""
    label: str = ""
    #: `typeRef` — 없으면 맞추지 않는다 (C14: 없으면 `"25" > 20`이 글자 비교가 된다).
    type: str = ""


class DecisionOutputInfo(ContractModel):
    id: str = ""
    name: str = ""
    type: str = ""


class DecisionRuleInfo(ContractModel):
    """규칙 줄 하나 — **칸의 원문**이다 (판정용 모델은 칸을 해석해 버린다)."""

    id: str = ""
    #: 입력 열 수와 같다.
    cells: list[str] = Field(default_factory=list)
    #: 출력 열 수와 같다.
    values: list[str] = Field(default_factory=list)
    description: str = ""


class DecisionTableInfo(ContractModel):
    """결정 하나(`dmn:decision` + `dmn:decisionTable`)를 격자로 (ADR-0148)."""

    id: str
    name: str = ""
    hit: str = "UNIQUE"
    inputs: list[DecisionInputInfo] = Field(default_factory=list)
    outputs: list[DecisionOutputInfo] = Field(default_factory=list)
    rules: list[DecisionRuleInfo] = Field(default_factory=list)


class DecisionsResponse(ContractModel):
    """`GET /api/v1/workspaces/{id}/decisions/{path}` — 그 파일의 결정표들.

    **결정표가 아닌 결정은 오지 않는다** — 격자로 그릴 것이 없다. 그래도 파일에는 남아 있고
    저장할 때 그대로 간다.
    """

    tables: list[DecisionTableInfo] = Field(default_factory=list)
    #: 그 파일의 `revision` — 저장할 때 `If-Match`에 싣는다 (C17 파일 규칙과 같다).
    revision: str = ""


class DecisionSaveRequest(SchemaVersioned):
    """`PUT /api/v1/workspaces/{id}/decisions/{path}` — 결정표 **하나**를 바꿔 쓴다."""

    table: DecisionTableInfo
    #: 결정 id를 바꾸는 경우의 **옛 id**. 없으면 `table.id`를 찾는다.
    original_id: str | None = None


class DecisionSaveResponse(ContractModel):
    """저장한 뒤 — 새 `revision`과 **막지 않은 경고**(겹친 입력 이름·빈 규칙 줄)."""

    revision: str = ""
    warnings: list[str] = Field(default_factory=list)


# ─────────────────────────── 시험 실행 ───────────────────────────


class TrialCreateRequest(SchemaVersioned):
    """`POST /api/v1/workspaces/{id}/test-runs`.

    **이름에 `Test`를 넣지 않는다** (`Trial…`) — pytest가 시험 클래스로 알고 모으려다 경고한다
    (`core.testrun.RunSettings`와 같은 덫이다). 계약 문서의 길과 글은 「시험 실행」 그대로다.

    **케이스를 비우면 비교하지 않는다** (`비교 안 함`) — 그림을 그냥 돌려 보는 자리다.
    """

    #: 케이스 이름. 비우면 기대 결과를 비교하지 않는다.
    case: str | None = None
    mode: str = MODE_AUTONOMOUS


class TrialTarget(ContractModel):
    """시험 작업이 돌릴 것 — C4 `JobDispatch.test`에 실려 내려간다.

    **이 칸이 있으면 시험 작업이다** (ADR-0146). 배포가 없으므로 `bpm_process_id`·`version`은
    작업공간이 말해 주는 값이고, 실행기는 `revision`으로 묶음을 집어 간다.
    """

    workspace_id: str
    #: 집어 갈 묶음 (C17 `GET /workspaces/{id}/bundle`).
    revision: str
    #: **실행 id를 Center가 정한다** (`test_…`) — 콘솔이 만들자마자 그것으로 묻기 때문이다.
    #: 운영 작업과 다른 점이고, 그래서 실행기는 제 id를 짓지 않고 이것을 쓴다.
    run_id: str = ""
    case: str | None = None
    mode: str = MODE_AUTONOMOUS


class TrialInfo(ContractModel):
    """시험 실행 하나 — 상태·판정·로그·노드 색·변수 (CON-20 「시험 실행」)."""

    #: **`test_`로 시작한다** (C3 — 운영 실행과 한눈에 갈린다).
    run_id: str
    workspace_id: str
    state: str  # 열린 문자열 (KNOWN_TEST_RUN_STATES)
    #: 끝났을 때만 (KNOWN_TEST_VERDICTS). 도는 중에는 `None`이다.
    verdict: str | None = None
    detail: str = ""
    case: str = ""
    mode: str = MODE_AUTONOMOUS
    requested_by: str = ""
    requested_at: Timestamp | None = None
    #: 마지막으로 바뀐 때 — **소요를 재는 자리**다 (끝난 실행은 그때가 끝난 때다).
    #: 「끝난 때」를 따로 두지 않는다 — 끝나면 더 바뀌지 않으므로 두 칸이 갈라질 자리만 생긴다.
    updated_at: Timestamp | None = None
    #: 로그 줄 — `Listener.said`가 낸 것 그대로.
    log: list[str] = Field(default_factory=list)
    #: `{노드 id: 상태}` (KNOWN_NODE_STATES) — 캔버스가 칠한다.
    node_states: dict[str, str] = Field(default_factory=dict)
    #: 지금 값. **업무 값이라 목록에서는 키만** 보인다 (계약 README 원칙 6, U10).
    variables: dict[str, Any] = Field(default_factory=dict)
    #: 적은 재생 명세 수 (ADR-0028 — 끝까지 간 실행만 적는다).
    learned: int = 0


class TrialReport(ContractModel):
    """실행기가 올리는 시험 실행의 **진행과 끝** — `PUT /workspaces/{id}/test-runs/{run_id}`.

    **하트비트에 싣지 않는다** — 로그가 길고(수백 줄) 하트비트는 작은 JSON이다. 검사·짓기와 다른
    자리인 까닭이 그것이다. 지시는 그쪽들과 같이 Center에서 내려가고(`jobs[]`의 `test` 칸), 올리는
    것만 이 길이다 — 콘솔이 도는 중에도 로그와 노드 색을 본다 (CON-20).

    **배운 것은 여기 실려 올라오고 Center가 `memory/specs.json`에 적는다** (ADR-0028) — 엔진은
    파일을 쓰지 않고 실행기의 디스크는 그 실행이 끝나면 사라진다.
    """

    run_id: str
    state: str
    verdict: str | None = None
    detail: str = ""
    log: list[str] = Field(default_factory=list)
    node_states: dict[str, str] = Field(default_factory=dict)
    variables: dict[str, Any] = Field(default_factory=dict)
    #: 자율 수행이 배운 재생 명세 (C14 `ReplayMemory`의 본문 그대로). **끝까지 간 실행만.**
    learned: dict[str, Any] | None = None


# ─────────────────────────── 실행 전 검사 ───────────────────────────


class CheckDispatch(ContractModel):
    """내려온 검사 지시 하나 (C12 `checks[]`). **작업이 아니다** — 실행 id도 C3 사건도 없다."""

    check_id: str
    workspace_id: str
    revision: str


class CheckResult(ContractModel):
    """검사 하나의 결과 (C12 `check_results[]`)."""

    check_id: str
    violations: list[Violation] = Field(default_factory=list)
    #: 검사하지 못했을 때의 사유 (그림을 읽지 못했다·묶음을 집지 못했다). 그러면 `violations`는 비어 있다.
    reason: str | None = None


class CheckResponse(ContractModel):
    """`POST`·`GET /api/v1/workspaces/{id}/check`의 답.

    **오류만 돌리기를 막는다** — 경고는 보이고 사람이 판단한다 (C14 §검사 규칙).
    `cached`면 실행기에 다시 묻지 않고 담아 둔 것을 준 것이다 (ADR-0146 — 저장할 때마다 묻지 않는다).

    **아직 안 끝났으면 `state: pending`이고 202다** — 검사는 실행기가 하고 지시는 하트비트로
    내려가므로 주기만큼 늦을 수 있다. 콘솔은 `GET`으로 다시 묻는다. 끝났으면 `done`이다.
    """

    state: str = "done"  # done | pending | failed
    check_id: str = ""
    violations: list[Violation] = Field(default_factory=list)
    #: 이 결과가 본 묶음. 지금 묶음과 다르면 낡은 것이다.
    checked_revision: str = ""
    checked_at: Timestamp | None = None
    cached: bool = False
    #: 검사하지 못한 사유 (`failed`일 때) — 그림을 읽지 못했다·묶음을 집지 못했다.
    reason: str | None = None


# ─────────────────────────── 배포 후보로 만들기 ───────────────────────────


class BuildRequest(SchemaVersioned):
    """`POST /api/v1/workspaces/{id}/package` — 「배포 후보로 만들기」 (ADR-0143 §2)."""

    kind: str = "bpm_process"  # KNOWN_BUILD_KINDS


class BuildDispatch(ContractModel):
    """내려온 짓기 지시 하나 (C12 `builds[]`). 검사와 같은 결 — **작업이 아니다**."""

    build_id: str
    workspace_id: str
    revision: str
    kind: str = "bpm_process"


class BuildResult(ContractModel):
    """짓기 하나의 결과 (C12 `build_results[]`).

    **zip은 여기 싣지 않는다** — 하트비트는 작은 JSON이다. 다 지은 것은 C17의 올리기 길로 간다
    (`POST /workspaces/{id}/builds/{build_id}/artifact`, ADR-0146).
    """

    build_id: str
    ok: bool
    #: 못 지은 사유 (`PackageError`의 글). 콘솔이 그 자리에 보인다.
    reason: str | None = None


class BuildInfo(ContractModel):
    """짓기 하나 — 콘솔이 「배포 후보로 만들기」의 진행과 끝을 본다."""

    build_id: str
    workspace_id: str
    state: str  # KNOWN_BUILD_STATES
    kind: str = "bpm_process"
    revision: str = ""
    #: 등록된 패키지 (`done`일 때만). 승인·배포는 여기서부터 CON-06·CON-15다.
    package_id: str | None = None
    version: str | None = None
    reason: str | None = None
    #: **단추를 누른 콘솔 계정**이다 — 실행기가 아니다 (ADR-0146). 등록의 `uploaded_by`가 된다.
    requested_by: str = ""
    requested_at: Timestamp | None = None


__all__ = [
    "ALLOWED_SUFFIXES",
    "KNOWN_BUILD_KINDS",
    "KNOWN_BUILD_STATES",
    "KNOWN_NODE_STATES",
    "KNOWN_TEST_MODES",
    "KNOWN_TEST_RUN_STATES",
    "KNOWN_TEST_VERDICTS",
    "MODE_AUTONOMOUS",
    "MODE_DETERMINISTIC",
    "PROCESS_JSON",
    "TEST_RUN_PREFIX",
    "READ_ONLY_DIRS",
    "VERDICT_ERROR",
    "VERDICT_FAIL",
    "VERDICT_NO_EXPECT",
    "VERDICT_PASS",
    "VERDICT_STOPPED",
    "WORKSPACE_ID_PATTERN",
    "BuildDispatch",
    "BuildInfo",
    "BuildRequest",
    "BuildResult",
    "CheckDispatch",
    "CheckResponse",
    "CheckResult",
    "FileInfo",
    "InstalledLibInfo",
    "LibInstallRequest",
    "TrialCreateRequest",
    "TrialInfo",
    "TrialReport",
    "TrialTarget",
    "WorkspaceCreateRequest",
    "DecisionInputInfo",
    "DecisionOutputInfo",
    "DecisionRuleInfo",
    "DecisionSaveRequest",
    "DecisionSaveResponse",
    "DecisionTableInfo",
    "DecisionsResponse",
    "WorkspaceId",
    "WorkspaceInfo",
    "WorkspaceUpdateRequest",
    "check_file_path",
]
