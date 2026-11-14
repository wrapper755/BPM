"""실행 전 검사와 배포 후보 짓기 — **작업이 아니다** (C17,
[ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)).

실행 id도 C3 사건도 기다림도 없다. 그래서 작업 표를 쓰지 않고 하트비트의 작은 칸으로 내려가고
결과를 되올린다 — 배포 설치(`deployment_results`)와 같은 결이다.

**둘 다 실행기가 한다.** Center는 BPMN을 해석하지 못한다 (`bpm-center`는 `bpm-core`를 의존하지
않는다) — 검사는 B15가 `core.expr_check`에 있어 가를 수조차 없고, 짓는 것은 매니페스트를 그림에서
모으는 일이다.

두 가지가 이 모듈의 규칙이다.

- **검사는 되묻지 않는다** — 마지막 결과를 **그때 본 묶음(`revision`)과 함께** 담아 두고 바뀐
  것이 없으면 그대로 준다. 저장할 때마다 실행기를 거치면 느리다(하트비트 주기만큼).
- **지은 zip은 Center가 제 이름으로 등록한다** — 실행기는 C17의 올리기 길 하나로 보내고, 받는
  검사는 **C5 `POST /packages`와 같은 함수**다. 실행기 키에 패키지 올리기 권한을 주지 않는다.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from bpm.center import workspaces
from bpm.center.errors import ApiError
from bpm.center.storage import Store, dumps, loads, now_iso
from bpm.contracts import Violation
from bpm.contracts.workspace import (
    KNOWN_BUILD_KINDS,
    BuildDispatch,
    BuildInfo,
    BuildRequest,
    BuildResult,
    CheckDispatch,
    CheckResponse,
    CheckResult,
)

#: 한 작업공간이 들고 있는 짓기 기록 수. 넘으면 오래된 끝난 것부터 지운다.
KEEP_BUILDS = 50

#: 내려보낸 뒤 결과를 기다리는 한도 (초). 넘으면 **다시 내려보낸다** — 실행기가 다시 떴거나
#: 지시를 잃었다. 작업처럼 ack로 맞추지 않는 까닭: 실행을 만들지 않아 되짚을 `run_id`가 없다.
RETRY_AFTER_S = 120


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


# ─────────────────────────── 실행 전 검사 ───────────────────────────


def _check_row(store: Store, *, workspace_id: str, revision: str) -> Any:
    return store.row(
        "SELECT * FROM workspace_checks WHERE workspace_id = ? AND revision = ?",
        (workspace_id, revision),
    )


def _as_response(row: Any, *, cached: bool) -> CheckResponse:
    return CheckResponse(
        state=row["state"],
        check_id=row["check_id"],
        violations=[Violation.model_validate(one) for one in loads(row["violations_json"], []) or []],
        checked_revision=row["revision"],
        checked_at=row["checked_at"],
        cached=cached,
        reason=row["reason"],
    )


def check(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    actor: str,
    company: str | None,
    again: bool = False,
) -> tuple[CheckResponse, bool]:
    """검사를 청한다 — `(답, 끝났나)`. 끝나지 않았으면 부르는 쪽이 202로 답한다.

    **같은 묶음의 결과가 있으면 그것을 준다** (`cached`) — `again`이면 버리고 다시 묻는다
    (운영자가 「다시 검사」를 누른 자리).
    """
    info = workspaces.get(
        store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company
    )
    before = _check_row(store, workspace_id=workspace_id, revision=info.revision)
    if before is not None and not again:
        if before["state"] == "done":
            return _as_response(before, cached=True), True
        return _as_response(before, cached=False), False

    at = now_iso()
    check_id = _new_id("chk")
    with store.tx() as cur:
        cur.execute(
            "DELETE FROM workspace_checks WHERE workspace_id = ? AND revision = ?",
            (workspace_id, info.revision),
        )
        cur.execute(
            "INSERT INTO workspace_checks (check_id, workspace_id, revision, state,"
            " violations_json, reason, requested_by, requested_at, checked_at, dispatched_at)"
            " VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?, NULL, NULL)",
            (check_id, workspace_id, info.revision, actor, at),
        )
    row = _check_row(store, workspace_id=workspace_id, revision=info.revision)
    return _as_response(row, cached=False), False


def latest_check(
    store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None
) -> tuple[CheckResponse, bool]:
    """지금 묶음의 검사 결과 — 없으면 404다 (청하지 않았다).

    **낡은 결과를 주지 않는다** — 파일이 바뀌면 묶음이 달라지고, 그러면 그 결과는 다른 그림의
    것이다. 콘솔은 다시 청한다.
    """
    info = workspaces.get(
        store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company
    )
    row = _check_row(store, workspace_id=workspace_id, revision=info.revision)
    if row is None:
        raise ApiError(404, "not_found", "이 묶음의 검사 결과가 없다 — 먼저 청하세요")
    return _as_response(row, cached=True), row["state"] == "done"


def pending_checks(store: Store) -> list[CheckDispatch]:
    """내려보낼 검사 지시 — 아직 안 내려갔거나 **너무 오래 답이 없는** 것."""
    rows = store.rows(
        "SELECT * FROM workspace_checks WHERE state = 'pending' ORDER BY requested_at, check_id"
    )
    return [
        CheckDispatch(
            check_id=row["check_id"], workspace_id=row["workspace_id"], revision=row["revision"]
        )
        for row in rows
        if _due(row["dispatched_at"])
    ]


def _due(dispatched_at: str | None) -> bool:
    """다시 내려보낼 때인가 — 한 번도 안 갔거나 한도를 넘겼다."""
    if not dispatched_at:
        return True
    from datetime import UTC, datetime

    try:
        then = datetime.fromisoformat(dispatched_at)
    except ValueError:  # pragma: no cover - 방어
        return True
    return (datetime.now(UTC) - then).total_seconds() > RETRY_AFTER_S


def checks_went_down(store: Store, dispatched: list[CheckDispatch]) -> None:
    at = now_iso()
    with store.tx() as cur:
        for one in dispatched:
            cur.execute(
                "UPDATE workspace_checks SET dispatched_at = ? WHERE check_id = ?", (at, one.check_id)
            )


def remember_checks(store: Store, results: list[CheckResult]) -> None:
    """올라온 검사 결과를 적는다 — **그때 본 묶음과 함께** 담겨 캐시가 된다 (ADR-0146)."""
    if not results:
        return
    at = now_iso()
    with store.tx() as cur:
        for one in results:
            cur.execute(
                "UPDATE workspace_checks SET state = ?, violations_json = ?, reason = ?,"
                " checked_at = ? WHERE check_id = ?",
                (
                    "failed" if one.reason else "done",
                    dumps([v.to_json_dict() for v in one.violations]),
                    one.reason,
                    at,
                    one.check_id,
                ),
            )


# ─────────────────────────── 배포 후보로 만들기 ───────────────────────────


def _build_info(row: Any) -> BuildInfo:
    return BuildInfo(
        build_id=row["build_id"],
        workspace_id=row["workspace_id"],
        state=row["state"],
        kind=row["kind"],
        revision=row["revision"],
        package_id=row["package_id"],
        version=row["version"],
        reason=row["reason"],
        requested_by=row["requested_by"],
        requested_at=row["requested_at"],
    )


def _build(store: Store, build_id: str, *, workspace_id: str | None = None) -> Any:
    sql = "SELECT * FROM workspace_builds WHERE build_id = ?"
    params: list[Any] = [build_id]
    if workspace_id is not None:
        sql += " AND workspace_id = ?"
        params.append(workspace_id)
    found = store.row(sql, params)
    if found is None:
        raise ApiError(404, "not_found", f"짓기 기록이 없다: {build_id}")
    return found


def start_build(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    body: dict[str, Any],
    actor: str,
    company: str | None,
) -> BuildInfo:
    """「배포 후보로 만들기」를 청한다 (ADR-0143 §2).

    **BPM 프로세스는 진입 정의가 없으면 지을 수 없다** (422 `no_entry`) — 매니페스트의 `entry`가
    될 값이다. **공유 프로세스는 묻지 않는다** — `kind=process_lib`에는 진입이 없고(C1, R1은
    `bpm_process`에만 묻는다) 짓는 쪽도 정의 전부를 담는다 (`export_lib`).
    """
    info = workspaces.get(
        store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company
    )
    try:
        request = BuildRequest.model_validate({"schema": 1, **body})
    except ValidationError as e:
        raise ApiError(422, "input_invalid", "요청이 계약과 맞지 않는다", {"errors": e.errors()}) from e
    if request.kind not in KNOWN_BUILD_KINDS:
        raise ApiError(422, "input_invalid", f"종류는 {' 또는 '.join(sorted(KNOWN_BUILD_KINDS))}이다")
    if request.kind == "bpm_process" and not info.entry:
        raise ApiError(422, "no_entry", "진입 정의를 먼저 고르세요")

    build_id = _new_id("bld")
    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO workspace_builds (build_id, workspace_id, revision, kind, state,"
            " package_id, version, reason, requested_by, requested_at, updated_at, dispatched_at)"
            " VALUES (?, ?, ?, ?, 'queued', NULL, NULL, NULL, ?, ?, ?, NULL)",
            (build_id, workspace_id, info.revision, request.kind, actor, at, at),
        )
    _forget_builds(store, workspace_id)
    return _build_info(_build(store, build_id))


def _forget_builds(store: Store, workspace_id: str) -> None:
    rows = store.rows(
        "SELECT build_id FROM workspace_builds WHERE workspace_id = ?"
        " AND state IN ('done', 'failed') ORDER BY requested_at DESC",
        (workspace_id,),
    )
    extra = [row["build_id"] for row in rows[KEEP_BUILDS:]]
    if not extra:
        return
    with store.tx() as cur:
        for build_id in extra:
            cur.execute("DELETE FROM workspace_builds WHERE build_id = ?", (build_id,))


def builds(
    store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None
) -> list[BuildInfo]:
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    return [
        _build_info(row)
        for row in store.rows(
            "SELECT * FROM workspace_builds WHERE workspace_id = ?"
            " ORDER BY requested_at DESC, build_id",
            (workspace_id,),
        )
    ]


def build(
    store: Store, *, workspace_dir: Path, workspace_id: str, build_id: str, company: str | None
) -> BuildInfo:
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    return _build_info(_build(store, build_id, workspace_id=workspace_id))


def pending_builds(store: Store) -> list[BuildDispatch]:
    rows = store.rows(
        "SELECT * FROM workspace_builds WHERE state IN ('queued', 'building')"
        " ORDER BY requested_at, build_id"
    )
    return [
        BuildDispatch(
            build_id=row["build_id"],
            workspace_id=row["workspace_id"],
            revision=row["revision"],
            kind=row["kind"],
        )
        for row in rows
        if _due(row["dispatched_at"])
    ]


def builds_went_down(store: Store, dispatched: list[BuildDispatch]) -> None:
    at = now_iso()
    with store.tx() as cur:
        for one in dispatched:
            cur.execute(
                "UPDATE workspace_builds SET state = 'building', dispatched_at = ?, updated_at = ?"
                " WHERE build_id = ?",
                (at, at, one.build_id),
            )


def remember_builds(store: Store, results: list[BuildResult]) -> None:
    """올라온 짓기 결과 — **못 지은 것만** 여기서 닫는다.

    지은 것은 **zip이 올라온 자리에서** 닫힌다 (`took_artifact`) — 결과만 먼저 오면 패키지가
    없는 `done`이 생긴다.
    """
    if not results:
        return
    at = now_iso()
    with store.tx() as cur:
        for one in results:
            if one.ok:
                continue
            cur.execute(
                "UPDATE workspace_builds SET state = 'failed', reason = ?, updated_at = ?"
                " WHERE build_id = ? AND state != 'done'",
                (one.reason or "짓지 못했다", at, one.build_id),
            )


def took_artifact(
    store: Store, *, package_dir: Path, workspace_id: str, build_id: str, raw: bytes
) -> BuildInfo:
    """실행기가 올린 zip을 **C5와 같은 함수로** 받아 후보로 등록한다 (ADR-0146).

    **올린 사람은 단추를 누른 콘솔 계정**이다 — 실행기가 아니다. 그래서 「누가 설계했나」를
    잃지 않고, C5 권한표의 실행기 키 줄도 그대로다.
    """
    row = _build(store, build_id, workspace_id=workspace_id)
    # 이미 `done`이면 재시도다 — 같은 zip이면 `upload`가 200으로 돌려주고 다른 zip은 409다.
    from bpm.center.api import packages  # noqa: PLC0415 — 순환 import를 피한다

    owner = store.row("SELECT company FROM workspaces WHERE id = ?", (workspace_id,))
    try:
        info, _ = packages.upload(
            store,
            package_dir=package_dir,
            raw=raw,
            # **단추를 누른 콘솔 계정**이 올린 사람이다 (ADR-0146).
            actor=row["requested_by"],
            # 패키지는 그 작업공간의 회사 것이다 (C16 — 작업공간의 회사는 바뀌지 않는다).
            company=None if owner is None else owner["company"],
        )
    except ApiError as e:
        at = now_iso()
        with store.tx() as cur:
            cur.execute(
                "UPDATE workspace_builds SET state = 'failed', reason = ?, updated_at = ?"
                " WHERE build_id = ?",
                (f"{e.code}: {e.message}", at, build_id),
            )
        raise
    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "UPDATE workspace_builds SET state = 'done', package_id = ?, version = ?,"
            " reason = NULL, updated_at = ? WHERE build_id = ?",
            (info.id, info.version, at, build_id),
        )
    return _build_info(_build(store, build_id))


__all__ = [
    "KEEP_BUILDS",
    "RETRY_AFTER_S",
    "build",
    "builds",
    "builds_went_down",
    "check",
    "checks_went_down",
    "latest_check",
    "pending_builds",
    "pending_checks",
    "remember_builds",
    "remember_checks",
    "start_build",
    "took_artifact",
]
