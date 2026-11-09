"""콘솔에서 고치는 외부 확장 — HTTP 어댑터 앱 만들기·고치기·내리기·판 기록·쓰는 곳·시험 호출 (C7, ADR-0141).

| 경로 | 인증 |
| --- | --- |
| `POST /resources/extensions`, `PUT·DELETE /resources/extensions/{id}`, `…/test-calls[/{task_id}]` | Center 관리자 |
| `GET /resources/extensions/{id}/versions·dependents` | 읽기 |

**정의마다 원본은 하나다** — 여기서 만든 id는 원본이 `console`이고 일꾼이 올리지 못한다(C15 409
`source_is_console`). 일꾼이 올린 id(`consumer`)는 여기서 만들거나 고치거나 내리지 못한다(409
`source_is_consumer`). 관문은 일꾼이 올릴 때와 **같은 `resources.register_extension`**이다 — 검사(E1~E4)를
다 지난 정의에만 Center가 서명한다.

**고치면 새 판이다** — 옛 판은 철회하지 않는다. 정의를 고정한 BPM 프로세스(C1 `definition_hash`)는 그 판으로
돌고(ADR-0060), 일감의 `definition_version`이 일꾼에게 어느 판인지 말한다(C15).
"""

from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, Request

from bpm.center.api import external_tasks, resources
from bpm.center.auth import Caller, require_center_admin, require_read
from bpm.center.errors import ApiError
from bpm.center.storage import Store, loads, now_iso
from bpm.contracts.external_task import (
    FINAL_STATES,
    ORIGIN_TEST,
    TEST_RUN_PREFIX,
    ExternalTaskCreate,
    Idempotency,
)
from bpm.contracts.resources import (
    ExtensionCreateRequest,
    ExtensionDependent,
    ExtensionResource,
    ExtensionRevoked,
    ExtensionTestCall,
    ExtensionTestResult,
    ExtensionUpdateRequest,
    ExtensionVersionInfo,
)
from bpm.contracts.service_app import DEFAULT_TIMEOUT_S, MODE_AUTONOMOUS
from bpm.contracts.service_app import Caller as TaskCaller

router = APIRouter(prefix="/api/v1", tags=["console-extensions"])

#: 판을 비운 새 앱의 첫 판 (C7).
FIRST_VERSION = "0.1.0"
#: 콘솔이 올린 시험 일감의 올린 쪽 — 키가 아니라 Center 자신이라 관리자는 누구나 다시 묻는다.
CONSOLE_POSTER = "console"
#: 시험 일감의 노드 id — 실행이 없으니 지어 둔다.
TEST_NODE = "console-test-call"
HTTP_ADAPTER = "http-adapter"


# ─────────────────────────── 읽기 ───────────────────────────


def _rows(store: Store, extension_id: str) -> list[Any]:
    """그 id의 판 모두 — 새 판부터 (등록 순)."""
    return store.rows("SELECT * FROM extensions WHERE id = ? ORDER BY at DESC", (extension_id,))


def _console_rows(store: Store, extension_id: str) -> list[Any]:
    """원본이 콘솔인 id의 판들. 없으면 404, 일꾼이 원본이면 409 `source_is_consumer`."""
    rows = _rows(store, extension_id)
    if not rows:
        raise ApiError(404, "not_found", f"확장 {extension_id}가 없다")
    if resources.source_of(rows[0]) != resources.CONSOLE:
        raise ApiError(
            409, "source_is_consumer", f"{extension_id}는 일꾼이 올린 정의다 — 그 일꾼의 정의 파일을 고치세요"
        )
    return rows


def _live(rows: list[Any]) -> Any:
    """철회하지 않은 판 가운데 나중에 등록된 것 (`resources._external_rows`와 같은 규칙)."""
    return next((row for row in rows if not row["revoked_json"]), None)


def _revoked_at(row: Any) -> str | None:
    found = loads(row["revoked_json"])
    if not isinstance(found, dict):
        return None
    at = (found.get("payload") or {}).get("revoked_at")
    return str(at) if at else None


def versions(store: Store, extension_id: str) -> list[ExtensionVersionInfo]:
    """판 기록 (C7 `…/versions`) — 원본과 상관없이 읽힌다."""
    rows = _rows(store, extension_id)
    if not rows:
        raise ApiError(404, "not_found", f"확장 {extension_id}가 없다")
    return [
        ExtensionVersionInfo(
            version=str(row["version"]),
            definition_hash=str(row["definition_hash"]),
            registered_at=str(row["at"]),
            registered_by=row["registered_by"],
            revoked_at=_revoked_at(row),
            revoked_by=row["revoked_by"],
        )
        for row in rows
    ]


def dependents(store: Store, extension_id: str) -> list[ExtensionDependent]:
    """그 확장을 `requires.extensions`에 적은 **살아 있는 배포**의 BPM 프로세스 — 판마다 한 줄 (C7 `…/dependents`).

    고정한 해시가 있으면 어느 판의 것인지도 준다 — CON-18 저장·내리기 확인 창이 「다시 배포해야 새 판으로 돈다」를
    말하는 근거다. 읽을 때 센다(패키지 `dependents`와 같은 결 — 참조를 저장하지 않는다).
    """
    if not _rows(store, extension_id):
        raise ApiError(404, "not_found", f"확장 {extension_id}가 없다")
    by_hash = {
        str(row["definition_hash"]): str(row["version"])
        for row in reversed(_rows(store, extension_id))  # 같은 해시는 나중 판이 이긴다
    }
    out = []
    for row in store.rows(
        "SELECT d.bpm_process_id, d.version, COUNT(*) AS n, p.manifest_json FROM deployments d"
        " JOIN packages p ON p.id = d.bpm_process_id AND p.version = d.version"
        " WHERE d.revoked_json IS NULL GROUP BY d.bpm_process_id, d.version ORDER BY d.bpm_process_id, d.version"
    ):
        wanted = ((loads(row["manifest_json"], {}) or {}).get("requires") or {}).get("extensions") or []
        need = next((one for one in wanted if isinstance(one, dict) and one.get("id") == extension_id), None)
        if need is None:
            continue
        pinned = str(need["definition_hash"]) if need.get("definition_hash") else None
        out.append(
            ExtensionDependent(
                package_id=str(row["bpm_process_id"]),
                package_version=str(row["version"]),
                deployments=int(row["n"]),
                pinned_hash=pinned,
                pinned_version=by_hash.get(pinned) if pinned else None,
            )
        )
    return out


# ─────────────────────────── 만들기·고치기·내리기 ───────────────────────────


def _check_adapter(definition: dict[str, Any]) -> None:
    """콘솔이 받는 것은 HTTP 어댑터 앱뿐이다 — 처리기 앱은 처리기 패키지가 원본이다 (ADR-0141 §6)."""
    service = definition.get("service")
    protocol = service.get("protocol") if isinstance(service, dict) else None
    if definition.get("tier") != "external" or protocol != HTTP_ADAPTER:
        raise ApiError(
            422, "input_invalid", "콘솔에서는 HTTP 어댑터 앱(`tier: external`·`protocol: http-adapter`)만 만든다"
        )


def create(store: Store, found: Caller, raw: dict[str, Any]) -> ExtensionResource:
    """`POST /resources/extensions` — 원본이 콘솔인 새 앱. 이미 있는 id(어느 원본이든·철회된 것도)는 409."""
    body: ExtensionCreateRequest = external_tasks._model(ExtensionCreateRequest, raw)
    definition = dict(body.definition)
    _check_adapter(definition)
    definition.setdefault("version", FIRST_VERSION)
    ext_id = definition.get("id")
    if isinstance(ext_id, str) and _rows(store, ext_id):
        raise ApiError(409, "id_conflict", f"{ext_id}는 이미 있다 — 다른 id를 쓰세요 (내린 앱의 id도 다시 쓰지 않는다)")
    info, _ = resources.register_extension(store, found, {"definition": definition}, source=resources.CONSOLE)
    return info


def _next_version(base: str) -> str:
    """끝자리 + 1 (C7). `0.3.9` → `0.3.10`."""
    head, _, last = base.rpartition(".")
    if not head or not last.isdigit():
        raise ApiError(422, "input_invalid", f"판 {base}의 끝자리를 올릴 수 없다")
    return f"{head}.{int(last) + 1}"


def update(store: Store, found: Caller, extension_id: str, raw: dict[str, Any]) -> tuple[ExtensionResource, bool]:
    """`PUT /resources/extensions/{id}` — 고치기 = 새 판. `(응답, 새 판을 올렸나)`."""
    from bpm.contracts.extension import definition_hash  # noqa: PLC0415

    body: ExtensionUpdateRequest = external_tasks._model(ExtensionUpdateRequest, raw)
    rows = _console_rows(store, extension_id)
    live = _live(rows)
    if live is None:
        raise ApiError(409, "extension_revoked", f"{extension_id}는 내렸다 — 되살리지 않는다")
    current = str(live["version"])
    if body.base_version != current:
        raise ApiError(
            409,
            "version_conflict",
            f"그 사이 {extension_id}@{current}이 올라왔다 — 새 판을 다시 읽고 고치세요",
            {"current_version": current},
        )
    definition = dict(body.definition)
    if definition.get("id") != extension_id:
        raise ApiError(422, "input_invalid", "id는 바꿀 수 없다 — 토픽이다")
    _check_adapter(definition)
    # 내용이 같으면 판을 올리지 않는다 — 판만 다른 정의는 같은 정의다.
    if definition_hash({**definition, "version": current}) == str(live["definition_hash"]):
        return resources.extension(store, extension_id), False
    definition["version"] = _next_version(current)
    info, created = resources.register_extension(store, found, {"definition": definition}, source=resources.CONSOLE)
    return info, created


def revoke(store: Store, found: Caller, extension_id: str) -> ExtensionRevoked:
    """`DELETE /resources/extensions/{id}` — 철회하지 않은 판을 모두 거둔다. 쓰는 배포가 있어도 막지 않는다(C13)."""
    rows = _console_rows(store, extension_id)
    done = []
    for row in rows:
        if row["revoked_json"]:
            continue
        resources.revoke_extension(
            store, extension_id, str(row["version"]), reason="콘솔에서 내렸다", by=found.actor
        )
        done.append(str(row["version"]))
    return ExtensionRevoked(id=extension_id, revoked=done)


# ─────────────────────────── 시험 호출 ───────────────────────────


def start_test_call(
    store: Store, found: Caller, extension_id: str, raw: dict[str, Any]
) -> tuple[str, str, int]:
    """시험 일감을 Center가 스스로 올린다 (`origin: test`, `caller.type: console`). `(task_id, 판, 기다릴 초)`."""
    from bpm.contracts.extension import ExtensionManifest  # noqa: PLC0415

    body: ExtensionTestCall = external_tasks._model(ExtensionTestCall, raw)
    live = _live(_rows(store, extension_id))
    if live is None:
        raise ApiError(404, "not_found", f"확장 {extension_id}가 없다")
    manifest = ExtensionManifest.model_validate(json.loads(live["definition_json"]))
    operation = manifest.adapter.operation(body.operation) if manifest.adapter is not None else None
    if operation is None:
        raise ApiError(422, "operation_not_found", f"「{extension_id}」에 작업 「{body.operation}」이 없다")
    _, consumers, _ = resources.topic_state(store, extension_id)
    if consumers == 0:
        raise ApiError(422, "no_consumer", f"「{extension_id}」을 맡은 일꾼이 없다 — 일꾼에 그 토픽을 주세요")
    version = str(live["version"])
    task = ExternalTaskCreate(
        schema=ExternalTaskCreate.SCHEMA,
        topic=extension_id,
        operation=body.operation,
        mode=operation.modes[0] if operation.modes else MODE_AUTONOMOUS,
        idempotency=Idempotency(
            run_id=f"{TEST_RUN_PREFIX}console_{secrets.token_hex(8)}", node_id=TEST_NODE, node_instance=1, attempt=1
        ),
        caller=TaskCaller(type="console", host=found.actor),
        input=body.input,
        origin=ORIGIN_TEST,
    )
    task_id = external_tasks.insert(
        store,
        task,
        poster_key_id=CONSOLE_POSTER,
        timeout=DEFAULT_TIMEOUT_S,
        kind=operation.kind,
        # 원본이 일꾼이면 그 일꾼이 제 파일로 부른다 (C15 — 판을 싣지 않는다).
        definition_version=version if resources.source_of(live) == resources.CONSOLE else None,
        at=now_iso(),
    )
    return task_id, version, body.wait_s


def test_result(store: Store, extension_id: str, task_id: str) -> ExtensionTestResult:
    """시험 일감의 지금 모습. 끝났으면 **값을 지운다**(받은 뒤 지운다 — C15 ack와 같다)."""
    external_tasks.sweep(store)
    row = store.row("SELECT * FROM external_tasks WHERE task_id = ?", (task_id,))
    if row is None or row["poster_key_id"] != CONSOLE_POSTER or row["topic"] != extension_id:
        raise ApiError(404, "task_not_found", "그런 시험 호출이 없다")
    now = external_tasks.result_of(row)
    if now.state in FINAL_STATES:
        with store.tx() as cur:
            cur.execute(
                "UPDATE external_tasks SET input_json = NULL, output_json = NULL,"
                " acked_at = COALESCE(acked_at, ?) WHERE task_id = ?",
                (now_iso(), task_id),
            )
    return ExtensionTestResult(
        task_id=task_id,
        version=str(row["definition_version"] or ""),
        state=now.state,
        output=now.output,
        error=now.error.to_json_dict() if now.error else None,
    )


# ─────────────────────────── 경로 ───────────────────────────


def _store(request: Request) -> Store:
    store: Store = request.app.state.store
    return store


def _admin(request: Request) -> Caller:
    return require_center_admin(request.app.state.authenticate(request))


@router.post("/resources/extensions", status_code=201)
async def post_extension(request: Request) -> Any:
    found = _admin(request)
    return create(_store(request), found, await external_tasks._body(request))


@router.put("/resources/extensions/{extension_id}")
async def put_extension(request: Request, extension_id: str) -> Any:
    found = _admin(request)
    info, _ = update(_store(request), found, extension_id, await external_tasks._body(request))
    return info


@router.delete("/resources/extensions/{extension_id}")
def delete_extension(request: Request, extension_id: str) -> Any:
    return revoke(_store(request), _admin(request), extension_id)


@router.get("/resources/extensions/{extension_id}/versions")
def get_versions(request: Request, extension_id: str) -> Any:
    require_read(request.app.state.authenticate(request))
    return [one.to_json_dict() for one in versions(_store(request), extension_id)]


@router.get("/resources/extensions/{extension_id}/dependents")
def get_dependents(request: Request, extension_id: str) -> Any:
    require_read(request.app.state.authenticate(request))
    return [one.to_json_dict() for one in dependents(_store(request), extension_id)]


async def _answer(request: Request, extension_id: str, task_id: str, wait_s: int) -> Any:
    store = _store(request)

    def check() -> ExtensionTestResult | None:
        row = store.row("SELECT state FROM external_tasks WHERE task_id = ?", (task_id,))
        return test_result(store, extension_id, task_id) if row is not None and row["state"] in FINAL_STATES else None

    done = await external_tasks._until(request, wait_s, check)
    return (done or test_result(store, extension_id, task_id)).to_json_dict()


@router.post("/resources/extensions/{extension_id}/test-calls")
async def post_test_call(request: Request, extension_id: str) -> Any:
    found = _admin(request)
    raw = await external_tasks._body(request)
    task_id, _, wait_s = start_test_call(_store(request), found, extension_id, raw)
    external_tasks._waiters(request).ring()
    # 기다린 뒤에도 끝나지 않았으면 `pending`·`locked` 그대로 준다 — 결과 묻기로 다시 받는다 (C7).
    return await _answer(request, extension_id, task_id, wait_s)


@router.get("/resources/extensions/{extension_id}/test-calls/{task_id}")
async def get_test_call(request: Request, extension_id: str, task_id: str, wait_s: int = 0) -> Any:
    _admin(request)
    return await _answer(request, extension_id, task_id, wait_s)


__all__ = [
    "CONSOLE_POSTER",
    "FIRST_VERSION",
    "create",
    "dependents",
    "revoke",
    "router",
    "start_test_call",
    "test_result",
    "update",
    "versions",
]
