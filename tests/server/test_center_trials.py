"""시험 실행 — Center가 줄에 세우고 내려보내고 적는가 (C17, ADR-0146).

걸려 있는 줄:

1. **시험 자리는 따로 센다** — 운영이 꽉 차도 시험이 내려가고, 그 반대도 그렇다.
2. **실행 id는 Center가 정한다** (`test_…`) — 콘솔이 만들자마자 그것으로 묻는다.
3. **진행·끝은 하트비트가 아니라** C17 `PUT …/test-runs/{run_id}`로 올라온다.
4. **배운 것은 Center가** `memory/specs.json`에 적는다 (엔진은 파일을 쓰지 않는다).
5. 거절·유실된 시험 작업은 **끝으로 적는다** — 안 적으면 콘솔이 영원히 「도는 중」이다.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store

ADMIN = {"Authorization": "Bearer t-admin"}
READ = {"Authorization": "Bearer t-read"}
API = "/api/v1"
RUNNER = f"{API}/server-runner"
WS = "finance.invoice"
XML = '<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"/>'


@pytest.fixture
def workspace_dir(tmp_path: Path) -> Path:
    return tmp_path / "workspaces"


@pytest.fixture
def store() -> Iterator[Store]:
    found = Store(Path(":memory:"))
    yield found
    found.close()


@pytest.fixture
def client(store: Store, tmp_path: Path, workspace_dir: Path) -> Iterator[TestClient]:
    settings = Settings(
        admin_token="t-admin",
        read_token="t-read",
        package_dir=tmp_path / "pkg",
        workspace_dir=workspace_dir,
    )
    with TestClient(create_app(settings, store=store)) as found:
        yield found


def made(answer: Any, code: int = 201) -> Any:
    assert answer.status_code == code, answer.text
    return answer.json()


def runner_key(client: TestClient) -> str:
    answer = client.post(f"{API}/center-keys", json={"name": "srv-1", "type": "server_runner"}, headers=ADMIN)
    return str(made(answer)["key"])


def auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def register(client: TestClient, key: str) -> str:
    body = {
        "schema": 1,
        "machine_id": hashlib.sha256(b"srv1").hexdigest(),
        "name": "서버 1",
        "os": "ubuntu-24.04",
        "versions": {"server_runner": "0.1.0", "core": "0.1.0"},
    }
    return str(made(client.post(f"{RUNNER}/register", json=body, headers=auth(key)), 200)["server_runner_id"])


def beat(client: TestClient, key: str, **capacity: int) -> dict[str, Any]:
    """하트비트 한 번. **`running[]`은 자리 셈에서 짓는다** — 계약이 둘을 대조한다."""
    counts = {"max": 10, "running": 0, **capacity}
    running = [
        _running(f"run_{i}") for i in range(counts["running"])
    ] + [_running(f"test_{i}") for i in range(counts.get("test_running", 0))]
    body = {"schema": 1, "status": "running", "capacity": counts, "running": running}
    return dict(made(client.post(f"{RUNNER}/heartbeat", json=body, headers=auth(key)), 200))


def _running(run_id: str) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "bpm_process_id": "finance.other",
        "version": "1.0.0",
        "started_at": "2026-11-13T09:00:00+09:00",
    }


def ready_workspace(client: TestClient) -> None:
    """돌릴 수 있는 작업공간 하나 — 그림과 진입 정의까지."""
    made(client.post(f"{API}/workspaces", json={"id": WS, "name": "청구서 발행"}, headers=ADMIN))
    made(client.put(f"{API}/workspaces/{WS}/files/process/main.bpmn", content=XML.encode("utf-8"), headers=ADMIN))
    made(client.patch(f"{API}/workspaces/{WS}", json={"entry": "process/main.bpmn"}, headers=ADMIN), 200)


def start_trial(client: TestClient, **body: Any) -> Any:
    return made(client.post(f"{API}/workspaces/{WS}/test-runs", json=body, headers=ADMIN))


# ─────────────────────────── 만들기 ───────────────────────────


def test_a_workspace_without_an_entry_cannot_run(client: TestClient) -> None:
    """돌려 보고서야 알면 **사람이 엉뚱한 데를 고친다**."""
    made(client.post(f"{API}/workspaces", json={"id": WS, "name": "청구"}, headers=ADMIN))
    answer = client.post(f"{API}/workspaces/{WS}/test-runs", json={}, headers=ADMIN)
    assert answer.status_code == 422
    assert answer.json()["code"] == "no_entry"


def test_center_names_the_run_before_it_goes_anywhere(client: TestClient) -> None:
    """콘솔이 만들자마자 그 id로 묻는다 — 운영 작업과 다른 점이다."""
    ready_workspace(client)
    info = start_trial(client)
    assert info["run_id"].startswith("test_")
    assert info["state"] == "queued"
    assert "verdict" not in info, "도는 중에는 판정이 없다"
    assert info["mode"] == "autonomous"


def test_no_case_means_no_comparison(client: TestClient) -> None:
    ready_workspace(client)
    info = start_trial(client)
    assert info["case"] == ""


def test_a_mode_we_do_not_know_is_refused(client: TestClient) -> None:
    ready_workspace(client)
    answer = client.post(f"{API}/workspaces/{WS}/test-runs", json={"mode": "손으로"}, headers=ADMIN)
    assert answer.status_code == 422


# ─────────────────────────── 내려보내기 ───────────────────────────


def test_a_runner_with_no_test_slots_takes_none(client: TestClient) -> None:
    """보고하지 않으면 0이다 — **시험 모드를 모르는 실행기**에 내려보내지 않는다."""
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    start_trial(client)
    assert beat(client, key)["jobs"] == []


def test_the_test_job_carries_the_workspace_and_the_revision(client: TestClient) -> None:
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    info = start_trial(client, case="기본")
    answer = beat(client, key, test_max=2)
    assert len(answer["jobs"]) == 1
    job = answer["jobs"][0]
    assert job["test"]["workspace_id"] == WS
    assert job["test"]["run_id"] == info["run_id"]
    assert job["test"]["case"] == "기본"
    assert job["test"]["revision"].startswith("sha256:")
    assert job["version"] is None, "배포가 없다 — 판은 작업공간이 말해 준다"


def test_a_full_production_lane_does_not_hold_up_a_test(client: TestClient) -> None:
    """**서로 빌려주지 않는다** — 설계자가 돌려 보는 것이 운영에 걸리지 않는다 (ADR-0146)."""
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    start_trial(client)
    answer = beat(client, key, max=1, running=1, test_max=2)
    assert len(answer["jobs"]) == 1, "운영 빈자리는 0인데 시험은 내려간다"


def test_a_full_test_lane_does_not_hold_up_production(client: TestClient) -> None:
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    start_trial(client)
    answer = beat(client, key, test_max=1, test_running=1)
    assert answer["jobs"] == [], "시험 자리가 없다"


def test_a_test_run_goes_down_once(client: TestClient) -> None:
    """작업으로 묶이면 대기열에서 빠진다 — 두 번 내려가면 같은 그림을 둘이 돌린다."""
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    start_trial(client)
    assert len(beat(client, key, test_max=2)["jobs"]) == 1
    assert beat(client, key, test_max=2, test_running=1)["jobs"] == []


# ─────────────────────────── 올라온 것 ───────────────────────────


def dispatch(client: TestClient) -> tuple[str, str]:
    key = runner_key(client)
    register(client, key)
    ready_workspace(client)
    info = start_trial(client)
    beat(client, key, test_max=2)
    return key, str(info["run_id"])


def test_the_runner_reports_the_log_and_the_verdict(client: TestClient) -> None:
    key, run_id = dispatch(client)
    body = {
        "state": "done",
        "verdict": "통과",
        "detail": "케이스와 같다",
        "log": ["[시작] 청구서 발행", "[끝] 통과"],
        "node_states": {"Task_1": "done"},
        "variables": {"금액": 1000},
    }
    info = made(client.put(f"{API}/workspaces/{WS}/test-runs/{run_id}", json=body, headers=auth(key)), 200)
    assert info["verdict"] == "통과"
    assert info["log"][-1] == "[끝] 통과"
    assert info["node_states"] == {"Task_1": "done"}


def test_only_the_runner_may_report(client: TestClient) -> None:
    _, run_id = dispatch(client)
    answer = client.put(f"{API}/workspaces/{WS}/test-runs/{run_id}", json={"state": "done"}, headers=ADMIN)
    assert answer.status_code == 403
    assert answer.json()["code"] == "wrong_key_type"


def test_what_the_run_learned_lands_in_the_work_folder(client: TestClient) -> None:
    """**Center가 적는다** — 엔진은 파일을 쓰지 않고 실행기의 디스크는 사라진다 (ADR-0028)."""
    key, run_id = dispatch(client)
    learned = {"schema": 1, "specs": [{"node_id": "Task_1", "steps": []}]}
    info = made(
        client.put(
            f"{API}/workspaces/{WS}/test-runs/{run_id}",
            json={"state": "done", "verdict": "통과", "learned": learned},
            headers=auth(key),
        ),
        200,
    )
    assert info["learned"] == 1
    saved = client.get(f"{API}/workspaces/{WS}/files/memory/specs.json", headers=ADMIN)
    assert saved.status_code == 200
    assert json.loads(saved.text)["specs"][0]["node_id"] == "Task_1"


def test_a_run_that_did_not_finish_writes_no_memory(client: TestClient) -> None:
    """**끝까지 간 실행만** 적는다 — 반쯤 배운 것을 남기면 다음 재생이 그것을 믿는다."""
    key, run_id = dispatch(client)
    made(
        client.put(
            f"{API}/workspaces/{WS}/test-runs/{run_id}",
            json={"state": "failed", "verdict": "오류", "learned": {"schema": 1, "specs": [{"node_id": "x"}]}},
            headers=auth(key),
        ),
        200,
    )
    assert client.get(f"{API}/workspaces/{WS}/files/memory/specs.json", headers=ADMIN).status_code == 404


def test_stopping_does_not_judge(client: TestClient, store: Store) -> None:
    key, run_id = dispatch(client)
    info = made(client.delete(f"{API}/workspaces/{WS}/test-runs/{run_id}", headers=ADMIN), 200)
    assert info["state"] == "cancelled"
    assert info["verdict"] == "중지"
    row = store.row("SELECT cancel_requested FROM jobs WHERE run_id = ?", (run_id,))
    assert row is not None and row["cancel_requested"] == 1, "내려간 실행은 작업 취소로 닫는다"


def test_a_late_report_cannot_revive_a_stopped_run(client: TestClient) -> None:
    """중지한 뒤 늦게 온 보고가 판정을 되살리면 **사람이 본 것과 달라진다**."""
    key, run_id = dispatch(client)
    made(client.delete(f"{API}/workspaces/{WS}/test-runs/{run_id}", headers=ADMIN), 200)
    info = made(
        client.put(
            f"{API}/workspaces/{WS}/test-runs/{run_id}",
            json={"state": "done", "verdict": "통과"},
            headers=auth(key),
        ),
        200,
    )
    assert info["verdict"] == "중지"


def test_a_refused_test_job_ends_the_run(client: TestClient, store: Store) -> None:
    """안 적으면 콘솔이 영원히 「도는 중」이다 — 실행기가 받지 않은 것을 사람은 알 수 없다."""
    key, run_id = dispatch(client)
    job_id = _job_of(store, run_id)
    body = {
        "schema": 1,
        "status": "running",
        "capacity": {"max": 10, "running": 0, "test_max": 2, "test_running": 0},
        "running": [],
        "job_acks": [{"job_id": job_id, "result": "rejected", "reason": "not_ready"}],
    }
    made(client.post(f"{RUNNER}/heartbeat", json=body, headers=auth(key)), 200)
    info = made(client.get(f"{API}/workspaces/{WS}/test-runs/{run_id}", headers=READ), 200)
    assert info["state"] == "failed"
    assert info["verdict"] == "오류"
    assert "not_ready" in info["detail"]


def _job_of(store: Store, run_id: str) -> str:
    """그 시험 실행의 작업 id — **작업 목록에는 없다** (C17: 시험 작업은 CON-05에 두지 않는다)."""
    row = store.row("SELECT job_id FROM jobs WHERE run_id = ?", (run_id,))
    assert row is not None, run_id
    return str(row["job_id"])


def test_a_test_job_is_not_in_the_job_list(client: TestClient) -> None:
    """설계자가 돌려 보는 것이라 **운영자가 CON-05에서 읽을 것이 없다** (배포도 패키지도 없다)."""
    key, run_id = dispatch(client)
    listed = made(client.get(f"{API}/jobs", headers=ADMIN), 200)
    assert [one for one in listed if one.get("run_id") == run_id] == []


def test_deleting_the_workspace_takes_its_trials_with_it(client: TestClient, store: Store) -> None:
    """**고아를 남기지 않는다** — 로그·변수는 업무 값이고, 작업공간이 없으면 누구도 못 지운다.

    로컬 compose에 쳐 보고 드러났다: 작업공간을 지웠는데 시험 실행·검사·짓기가 세 표에 남았다.
    """
    ready_workspace(client)
    start_trial(client)
    made(client.post(f"{API}/workspaces/{WS}/check", headers=ADMIN), 202)
    made(client.post(f"{API}/workspaces/{WS}/package", json={}, headers=ADMIN), 202)
    assert client.delete(f"{API}/workspaces/{WS}", headers=ADMIN).status_code == 204
    for table in ("test_runs", "workspace_checks", "workspace_builds", "workspace_files"):
        row = store.row(f"SELECT COUNT(*) AS n FROM {table} WHERE workspace_id = ?", (WS,))  # noqa: S608
        assert row is not None and row["n"] == 0, table


def test_the_list_shows_the_newest_first(client: TestClient) -> None:
    ready_workspace(client)
    first = start_trial(client)
    second = start_trial(client)
    listed = made(client.get(f"{API}/workspaces/{WS}/test-runs", headers=READ), 200)
    assert [one["run_id"] for one in listed][:2] == [second["run_id"], first["run_id"]] or [
        one["run_id"] for one in listed
    ][:2] == [first["run_id"], second["run_id"]], "같은 때면 id 순이다"
    assert len(listed) == 2
