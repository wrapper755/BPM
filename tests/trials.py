"""시험 실행을 들고 있는 서버 실행기 — **시험 실행이 외부 작업을 올리는 길** (C15, ADR-0150).

올리는 쪽은 서버 실행기 하나이고, Center는 실행 id가 `test_…`일 때 **그 시험 실행이 이 실행기로
내려갔는지** 본다 (`test_runs.job_id` → `jobs.target_id`). 시험마다 그 행을 따로 세우면 네 자리에서
같은 SQL을 쓰게 되므로 **여기 하나로** 둔다.

콘솔이 시험 실행을 만들고(C17) 하트비트가 작업으로 내려보내는 길 자체는 `test_center_trials.py`·
`test_server_runner_testmode.py`가 본다 — 여기서 세우는 것은 **그 결과의 행**뿐이다.
"""

from __future__ import annotations

from typing import Any

#: 관리자 토큰 — 시험들이 쓰는 것과 같은 값이다.
ADMIN = {"Authorization": "Bearer t-admin"}
AT = "2026-11-15T09:00:00+09:00"


def runner_key(http: Any, *, name: str = "실행기", machine: str = "9" * 64) -> tuple[str, str]:
    """키를 발급해 `register`까지 — `(server_runner_id, 키)`.

    `http`는 `TestClient`든 `httpx.Client`든 된다 (둘 다 `post(path, json=, headers=)`를 받는다).
    """
    made = http.post("/api/v1/center-keys", json={"name": name, "type": "server_runner"}, headers=ADMIN)
    assert made.status_code == 201, made.text
    key = str(made.json()["key"])
    registered = http.post(
        "/api/v1/server-runner/register",
        json={
            "schema": 1,
            "machine_id": machine,
            "name": name,
            "os": "ubuntu-24.04",
            "versions": {"server_runner": "0.1.0", "core": "0.1.0"},
        },
        headers={"Authorization": f"Bearer {key}"},
    )
    assert registered.status_code < 400, registered.text
    return str(registered.json()["server_runner_id"]), key


def hold_trial(
    store: Any,
    *,
    runner_id: str,
    run_id: str,
    workspace: str = "ws1",
    job: str = "job_trial",
    by: str = "설계자",
) -> None:
    """그 실행기로 **내려간** 시험 실행 하나 (C17 — 작업 자리는 따로 센다, ADR-0146)."""
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO jobs (job_id, bpm_process_id, version, target_type, target_id, inputs_json,"
            " owner, body_hash, requested_by, requested_at, state, run_id, test_json)"
            " VALUES (?, ?, '', 'server_runner', ?, '{}', ?, '', ?, ?, 'dispatched', ?, '{}')",
            (job, workspace, runner_id, f"workspace:{workspace}", by, AT, run_id),
        )
        cur.execute(
            "INSERT INTO test_runs (run_id, workspace_id, job_id, revision, mode, state,"
            " requested_by, requested_at, updated_at)"
            " VALUES (?, ?, ?, 'r1', 'autonomous', 'running', ?, ?, ?)",
            (run_id, workspace, job, by, AT, AT),
        )
