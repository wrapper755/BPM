"""시험 실행 — 콘솔이 그리던 그림을 그 자리에서 돌려 본다 (C17,
[ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)).

**돌리는 것은 서버 실행기다.** Center가 하는 일은 셋뿐이다.

1. **작업으로 만들어 내려보낸다** — C12 `jobs[]`의 `test` 칸이다. 대기열·멱등·ack·취소·유실
   처리가 운영과 **한 자리**에 남는다(`api/jobs.py`). 자리만 따로 센다.
2. **실행 id를 정한다** (`test_…`) — 콘솔이 만들자마자 그것으로 묻기 때문이다. 운영 작업은
   실행기가 짓지만 여기서는 Center가 짓고 실행기가 그것을 쓴다.
3. **올라온 진행·끝을 적는다** — 로그·노드 색·변수·판정, 그리고 **배운 것을
   `memory/specs.json`에 쓴다** ([ADR-0028](../../../../../docs/decisions/0028-replay-memory.md)).
   엔진은 파일을 쓰지 않고 실행기의 디스크는 그 실행이 끝나면 사라진다.

**Center는 판정하지 않는다** — `통과`인지 `실패`인지는 케이스와 엔진이 정한다(`core.testrun`).
여기서 그 글을 지어내면 두 자리가 갈라진다.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from bpm.center import workspaces
from bpm.center.errors import ApiError
from bpm.center.storage import Store, dumps, loads, now_iso
from bpm.contracts.events import new_run_id as contract_run_id
from bpm.contracts.workspace import (
    KNOWN_TEST_MODES,
    TrialCreateRequest,
    TrialInfo,
    TrialReport,
    TrialTarget,
)

log = logging.getLogger(__name__)

#: 배운 재생 명세가 가는 자리 (C1 패키지 구성 — ADR-0028).
MEMORY_PATH = "memory/specs.json"

#: 끝난 상태 — 더 올라오는 것을 받지 않는다.
DONE_STATES = frozenset({"done", "failed", "cancelled"})

#: 한 작업공간이 들고 있는 시험 실행 수. 넘으면 **가장 오래된 끝난 것부터** 지운다.
KEEP_PER_WORKSPACE = 50


def new_run_id() -> str:
    """시험 실행의 id — **짓는 규칙은 계약에 있다** (C3 `RunId`의 패턴과 같은 자리).

    여기서 따로 지었다가 패턴을 어겼고, 그것이 **실행 기록의 첫 줄에서야** 드러났다 (엔진이
    `run_started`를 쓰지 못해 멈췄다). 앞자리 `test_`는 운영 실행과 한눈에 갈리게 한 것이다.
    """
    return contract_run_id(test=True)


def _info(row: Any) -> TrialInfo:
    return TrialInfo(
        run_id=row["run_id"],
        workspace_id=row["workspace_id"],
        state=row["state"],
        verdict=row["verdict"],
        detail=row["detail"] or "",
        case=row["case_name"] or "",
        mode=row["mode"],
        requested_by=row["requested_by"],
        requested_at=row["requested_at"],
        updated_at=row["updated_at"],
        log=loads(row["log_json"], []) or [],
        node_states=loads(row["node_states_json"], {}) or {},
        variables=loads(row["variables_json"], {}) or {},
        learned=row["learned"],
    )


def _must(store: Store, run_id: str, *, workspace_id: str) -> Any:
    found = store.row(
        "SELECT * FROM test_runs WHERE run_id = ? AND workspace_id = ?", (run_id, workspace_id)
    )
    if found is None:
        raise ApiError(404, "not_found", f"시험 실행이 없다: {run_id}")
    return found


# ─────────────────────────── 만들기 ───────────────────────────


def create(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    body: dict[str, Any],
    actor: str,
    company: str | None,
) -> TrialInfo:
    """시험 실행 하나를 만든다 — 작업으로 내려가기를 기다린다 (`queued`).

    **진입 정의가 없으면 돌릴 수 없다** (422 `no_entry`) — 돌려 보고서야 알면 사람이 엉뚱한
    데를 고친다. 케이스를 비우면 **비교하지 않는다**(판정 `비교 안 함`).
    """
    info = workspaces.get(
        store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company
    )
    if not info.entry:
        raise ApiError(422, "no_entry", "진입 정의를 먼저 고르세요")
    try:
        request = TrialCreateRequest.model_validate({"schema": 1, **body})
    except ValidationError as e:
        raise ApiError(422, "input_invalid", "요청이 계약과 맞지 않는다", {"errors": e.errors()}) from e
    if request.mode not in KNOWN_TEST_MODES:
        raise ApiError(422, "input_invalid", f"모드는 {' 또는 '.join(sorted(KNOWN_TEST_MODES))}이다")

    run_id = new_run_id()
    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO test_runs (run_id, workspace_id, job_id, revision, case_name, mode, state,"
            " verdict, detail, log_json, node_states_json, variables_json, learned,"
            " requested_by, requested_at, updated_at)"
            " VALUES (?, ?, NULL, ?, ?, ?, 'queued', NULL, '', NULL, NULL, NULL, 0, ?, ?, ?)",
            (run_id, workspace_id, info.revision, request.case, request.mode, actor, at, at),
        )
    _forget_old(store, workspace_id)
    return _info(_must(store, run_id, workspace_id=workspace_id))


def _forget_old(store: Store, workspace_id: str) -> None:
    """오래된 **끝난** 시험 실행을 잊는다 — 로그와 변수가 쌓이는 자리다 (도는 것은 두지 않는다)."""
    rows = store.rows(
        "SELECT run_id FROM test_runs WHERE workspace_id = ? AND state IN ('done', 'failed', 'cancelled')"
        " ORDER BY requested_at DESC",
        (workspace_id,),
    )
    extra = [row["run_id"] for row in rows[KEEP_PER_WORKSPACE:]]
    if not extra:
        return
    with store.tx() as cur:
        for run_id in extra:
            cur.execute("DELETE FROM test_runs WHERE run_id = ?", (run_id,))


def listing(
    store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None
) -> list[TrialInfo]:
    """목록 — 최근 것부터. **변수와 로그는 상세에만** 담는 것이 아니라 여기서도 그대로 온다.

    목록 화면이 키만 보이는 것은 **화면의 일**이다 (계약 README 원칙 6·U10) — 여기서 깎아 내면
    상세가 다시 묻게 되고, 그러면 같은 값이 두 길로 온다.
    """
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    return [
        _info(row)
        for row in store.rows(
            "SELECT * FROM test_runs WHERE workspace_id = ? ORDER BY requested_at DESC, run_id",
            (workspace_id,),
        )
    ]


def get(
    store: Store, *, workspace_dir: Path, workspace_id: str, run_id: str, company: str | None
) -> TrialInfo:
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    return _info(_must(store, run_id, workspace_id=workspace_id))


def stop(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    run_id: str,
    company: str | None,
) -> TrialInfo:
    """「중지」 — **판정하지 않는다** (C17 §시험 실행).

    아직 내려가지 않았으면 그 자리에서 닫고, 내려갔으면 **작업 취소를 세워** 실행기가 그 실행을
    닫게 한다 (ADR-0063과 같은 길 — 운영과 한 자리다).
    """
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    row = _must(store, run_id, workspace_id=workspace_id)
    if row["state"] in DONE_STATES:
        return _info(row)
    with store.tx() as cur:
        if row["job_id"]:
            cur.execute("UPDATE jobs SET cancel_requested = 1 WHERE job_id = ?", (row["job_id"],))
        cur.execute(
            "UPDATE test_runs SET state = 'cancelled', verdict = '중지',"
            " detail = '사용자가 중지했습니다 — 케이스를 판정하지 않습니다', updated_at = ?"
            " WHERE run_id = ?",
            (now_iso(), run_id),
        )
    return _info(_must(store, run_id, workspace_id=workspace_id))


# ─────────────────────────── 내려보내기 (api/jobs.py가 부른다) ───────────────────────────


def queued(store: Store) -> list[Any]:
    """작업이 되기를 기다리는 시험 실행 — 들어온 순서."""
    return list(
        store.rows(
            "SELECT * FROM test_runs WHERE state = 'queued' AND job_id IS NULL"
            " ORDER BY requested_at, run_id"
        )
    )


def target_of(row: Any) -> TrialTarget:
    return TrialTarget(
        workspace_id=row["workspace_id"],
        revision=row["revision"],
        run_id=row["run_id"],
        case=row["case_name"],
        mode=row["mode"],
    )


def took(store: Store, *, run_id: str, job_id: str) -> None:
    """그 시험 실행이 작업으로 내려갔다 — 작업 id를 묶어 둔다 (중지가 그것으로 취소를 세운다)."""
    with store.tx() as cur:
        cur.execute(
            "UPDATE test_runs SET job_id = ?, state = 'running', updated_at = ? WHERE run_id = ?",
            (job_id, now_iso(), run_id),
        )


def requeue(store: Store, *, run_id: str) -> None:
    """실행기가 **자리가 없어** 받지 못했다 — 줄로 돌려보낸다 (다음 하트비트에 다시 간다).

    끝으로 적지 않는 까닭: Center의 셈과 실행기의 셈이 한 주기 어긋날 수 있고, 그것 때문에
    사람이 다시 누르게 하면 **왜 실패했는지 알 수 없는 실패**가 된다.
    """
    with store.tx() as cur:
        cur.execute(
            "UPDATE test_runs SET state = 'queued', job_id = NULL, updated_at = ? WHERE run_id = ?",
            (now_iso(), run_id),
        )


def lost(store: Store, *, run_id: str, reason: str) -> None:
    """내려간 실행기를 잃었거나 작업이 거절됐다 — 끝으로 적는다 (`오류`)."""
    with store.tx() as cur:
        cur.execute(
            "UPDATE test_runs SET state = 'failed', verdict = '오류', detail = ?, updated_at = ?"
            " WHERE run_id = ? AND state NOT IN ('done', 'failed', 'cancelled')",
            (reason, now_iso(), run_id),
        )


# ─────────────────────────── 올라온 것 적기 ───────────────────────────


def report(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    run_id: str,
    body: dict[str, Any],
    actor: str,
) -> TrialInfo:
    """실행기가 올린 진행·끝 (`PUT …/test-runs/{run_id}`).

    **끝난 것은 다시 받지 않는다** — 중지한 뒤 늦게 온 보고가 판정을 되살리면 사람이 본 것과
    달라진다. 배운 것은 **끝까지 간 실행만** 작업 폴더에 적는다 (ADR-0028).
    """
    row = _must(store, run_id, workspace_id=workspace_id)
    try:
        sent = TrialReport.model_validate({"run_id": run_id, **body})
    except ValidationError as e:
        raise ApiError(422, "input_invalid", "보고가 계약과 맞지 않는다", {"errors": e.errors()}) from e
    if row["state"] in DONE_STATES:
        return _info(row)

    learned = 0
    if sent.state == "done" and sent.learned:
        learned = _write_memory(
            store,
            workspace_dir=workspace_dir,
            workspace_id=workspace_id,
            learned=sent.learned,
            actor=actor,
        )
    with store.tx() as cur:
        cur.execute(
            "UPDATE test_runs SET state = ?, verdict = ?, detail = ?, log_json = ?,"
            " node_states_json = ?, variables_json = ?, learned = ?, updated_at = ?"
            " WHERE run_id = ?",
            (
                sent.state,
                sent.verdict,
                sent.detail,
                dumps(sent.log),
                dumps(sent.node_states),
                dumps(sent.variables),
                learned,
                now_iso(),
                run_id,
            ),
        )
    return _info(_must(store, run_id, workspace_id=workspace_id))


def _write_memory(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    learned: dict[str, Any],
    actor: str,
) -> int:
    """배운 재생 명세를 `memory/specs.json`에 적는다 — **Center가 쓴다** (엔진은 파일을 쓰지 않는다).

    **덮어쓴다.** 합치는 규칙은 엔진의 것이고(ADR-0028) 여기서 또 정하면 두 자리가 갈라진다 —
    실행기가 보낸 것이 그 실행의 전부다.
    """
    specs = learned.get("specs")
    if not isinstance(specs, list) or not specs:
        return 0
    data = workspaces.record_bytes(learned)
    for attempt in (1, 2):
        before = store.row(
            "SELECT revision FROM workspace_files WHERE workspace_id = ? AND path = ?",
            (workspace_id, MEMORY_PATH),
        )
        try:
            workspaces.write_file(
                store,
                workspace_dir=workspace_dir,
                workspace_id=workspace_id,
                path=MEMORY_PATH,
                data=data,
                if_match=None if before is None else before["revision"],
                actor=actor,
                company=None,
            )
        except ApiError:
            # **판정을 잃지 않는다** — 둘이 한꺼번에 끝나면 `stale`이 날 수 있고, 그때 보고
            # 전체를 버리면 그 시험 실행이 영원히 「도는 중」으로 남는다. 한 번 다시 걸고,
            # 그래도 안 되면 **배운 것만 포기한다**(다시 돌리면 또 배운다).
            if attempt == 2:
                log.warning("배운 것을 적지 못했다 (%s) — 판정은 적는다", workspace_id)
                return 0
            continue
        return len(specs)
    return 0  # pragma: no cover - 위 루프가 늘 돌려준다


__all__ = [
    "DONE_STATES",
    "KEEP_PER_WORKSPACE",
    "MEMORY_PATH",
    "create",
    "get",
    "listing",
    "lost",
    "new_run_id",
    "queued",
    "report",
    "requeue",
    "stop",
    "target_of",
    "took",
]
