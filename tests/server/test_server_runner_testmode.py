"""시험 모드 — 실행기가 작업공간 묶음을 받아 **여기서** 돌리는가 (C17, ADR-0143 §3·ADR-0146).

**거리 하나를 끝까지 본다**: 콘솔이 작업공간을 만들고 → 시험 실행을 걸고 → 하트비트가 그것을
시험 작업으로 내려 주고 → 실행기가 묶음을 받아 풀고 엔진을 돌리고 → 진행·끝을 C17로 올리고 →
콘솔이 판정을 읽는다. 업무 예제 하나(FX-03b)와 그 케이스를 그대로 쓴다.

**Center는 진짜 앱이다** (TestClient) — 묶음 내려받기·보고가 실제 경로를 지난다.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import create_app
from bpm.center.settings import Settings as CenterSettings
from bpm.center.storage import Store
from bpm.server_runner import agent as agent_mod
from bpm.server_runner.center_client import CenterClient
from bpm.server_runner.settings import Settings

ADMIN = {"Authorization": "Bearer t-admin"}
READ = {"Authorization": "Bearer t-read"}
API = "/api/v1"
WS = "fx.amount-branch"

#: 업무 예제 FX-03b — 입력 하나로 갈라지고 사람 없이 끝까지 간다 (모델도 필요 없다).
EXAMPLE = Path("docs/08-business-examples/bpmn/fx03b_amount_branch.bpmn")
CASES = Path("docs/08-business-examples/cases/fx03b_amount_branch.cases.json")
#: 스레드가 도는 것을 기다리는 한도 (초).
WAIT_S = 30.0


@pytest.fixture
def store() -> Iterator[Store]:
    found = Store(Path(":memory:"))
    yield found
    found.close()


@pytest.fixture
def center(store: Store, tmp_path: Path) -> Iterator[TestClient]:
    settings = CenterSettings(
        admin_token="t-admin",
        read_token="t-read",
        package_dir=tmp_path / "pkg",
        workspace_dir=tmp_path / "workspaces",
    )
    with TestClient(create_app(settings, store=store)) as found:
        yield found


@pytest.fixture
def key(center: TestClient) -> str:
    answer = center.post(
        f"{API}/center-keys", json={"name": "서버 1", "type": "server_runner"}, headers=ADMIN
    )
    assert answer.status_code == 201, answer.text
    return str(answer.json()["key"])


@pytest.fixture
def runner(tmp_path: Path, key: str, center: TestClient) -> agent_mod.Agent:
    settings = Settings(
        center_url="http://center",
        name="서버 1",
        max_concurrency=3,
        max_test_concurrency=2,
        data_path=tmp_path / "runner",
    )
    settings.data_path.mkdir(parents=True, exist_ok=True)
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
    return agent_mod.Agent(
        settings=settings,
        client=CenterClient(base_url="http://center", api_key=key, client=center),
    )


def made(answer: Any, code: int = 201) -> Any:
    assert answer.status_code == code, answer.text
    return answer.json()


def workspace(center: TestClient) -> None:
    """예제 하나를 작업공간으로 — 그림·케이스·진입 정의까지."""
    made(center.post(f"{API}/workspaces", json={"id": WS, "name": "금액 갈래"}, headers=ADMIN))
    made(
        center.put(
            f"{API}/workspaces/{WS}/files/process/{EXAMPLE.name}",
            content=EXAMPLE.read_bytes(),
            headers=ADMIN,
        )
    )
    made(
        center.put(
            f"{API}/workspaces/{WS}/files/cases/{EXAMPLE.stem}.cases.json",
            content=CASES.read_bytes(),
            headers=ADMIN,
        )
    )
    made(
        center.patch(
            f"{API}/workspaces/{WS}", json={"entry": f"process/{EXAMPLE.name}"}, headers=ADMIN
        ),
        200,
    )


def trial(center: TestClient, **body: Any) -> str:
    return str(made(center.post(f"{API}/workspaces/{WS}/test-runs", json=body, headers=ADMIN))["run_id"])


def info(center: TestClient, run_id: str) -> Any:
    return made(center.get(f"{API}/workspaces/{WS}/test-runs/{run_id}", headers=READ), 200)


def wait_for(center: TestClient, run_id: str, *, states: tuple[str, ...] = ("done", "failed", "cancelled")) -> Any:
    """그 시험 실행이 끝나기를 기다린다 — **끝은 실행기가 올린다** (C17)."""
    import time

    until = time.monotonic() + WAIT_S
    while time.monotonic() < until:
        found = info(center, run_id)
        if found["state"] in states:
            return found
        time.sleep(0.05)
    raise AssertionError(f"{WAIT_S}초 안에 끝나지 않았다: {info(center, run_id)}")


def join(runner: agent_mod.Agent) -> None:
    """등록하고 첫 하트비트까지. **`once()`를 쓰지 않는다** — 그쪽은 작업을 받지 않는다."""
    assert runner.tick(), "등록"
    assert runner.tick(), "첫 하트비트"


def beat(runner: agent_mod.Agent) -> None:
    """하트비트 한 번 — 내려온 지시를 그 자리에서 받는다."""
    assert runner.tick()


# ─────────────────────────── 거리 ───────────────────────────


def test_a_trial_runs_here_and_the_console_reads_the_verdict(
    center: TestClient, runner: agent_mod.Agent
) -> None:
    """**엔진·케이스·기대값이 한 줄로 맞물리는가** — 데스크톱 Studio가 보던 그것이다."""
    join(runner)
    workspace(center)
    run_id = trial(center, case="고액")
    beat(runner)
    assert run_id in runner.trials, "시험 작업이 내려와 시작됐다"

    found = wait_for(center, run_id)
    assert found["state"] == "done"
    assert found["verdict"] == "통과", found["detail"]
    assert found["log"], "로그 줄이 올라왔다"


def test_the_case_decides_and_a_wrong_expectation_fails(
    center: TestClient, runner: agent_mod.Agent
) -> None:
    """**케이스가 오라클이다** — 기대와 다르면 `실패`다 (그림이 멀쩡해도)."""
    join(runner)
    workspace(center)
    broken = json.loads(CASES.read_text(encoding="utf-8"))
    broken["cases"][0]["expected"] = {"구분": "소액"}
    revision = center.get(
        f"{API}/workspaces/{WS}/files/cases/{EXAMPLE.stem}.cases.json", headers=ADMIN
    ).headers["etag"]
    made(
        center.put(
            f"{API}/workspaces/{WS}/files/cases/{EXAMPLE.stem}.cases.json",
            content=json.dumps(broken, ensure_ascii=False).encode("utf-8"),
            headers={**ADMIN, "If-Match": revision},
        ),
        200,
    )
    run_id = trial(center, case="고액")
    beat(runner)
    found = wait_for(center, run_id)
    assert found["verdict"] == "실패", found


def test_without_a_case_nothing_is_compared(center: TestClient, runner: agent_mod.Agent) -> None:
    """케이스를 비우면 **비교하지 않는다** — 「통과」로 보이지 않는 것이 요점이다.

    이 예제는 입력(`금액`)이 있어야 도는데 **입력을 주는 것이 케이스**다 (C17 — 시험 실행에
    입력 칸이 없다). 그래서 케이스 없이 돌리면 그 자리에서 업무 실패이고, 그것도 **「통과」가
    아니다**. 돌려 보지 않고 「비교 안 함」을 보이면 사람이 「됐다」로 읽는다.
    """
    join(runner)
    workspace(center)
    run_id = trial(center)
    beat(runner)
    found = wait_for(center, run_id)
    assert found["verdict"] != "통과", found
    assert found["detail"], "왜 그렇게 끝났는지 말해 준다"


def test_a_case_that_is_not_there_is_an_error(center: TestClient, runner: agent_mod.Agent) -> None:
    """**지어내지 않는다** — 조용히 「비교 안 함」으로 바꾸면 사람이 「통과했다」로 읽는다."""
    join(runner)
    workspace(center)
    run_id = trial(center, case="없는 케이스")
    beat(runner)
    found = wait_for(center, run_id)
    assert found["state"] == "failed"
    assert found["verdict"] == "오류"
    assert "없는 케이스" in found["detail"]


def test_the_trial_folder_is_gone_when_it_ends(center: TestClient, runner: agent_mod.Agent) -> None:
    """풀어 둔 그림에는 업무 값이 있다 — **끝나면 지운다**."""
    join(runner)
    workspace(center)
    run_id = trial(center, case="소액")
    beat(runner)
    folder = runner.settings.data_path / "trials" / run_id
    wait_for(center, run_id)
    for found in list(runner.trials.values()):
        found.join(timeout=WAIT_S)
    assert not folder.exists()


def test_a_trial_holds_a_test_slot_and_not_a_production_one(
    center: TestClient, runner: agent_mod.Agent
) -> None:
    """**자리를 따로 센다** — 운영 상한이 시험 때문에 줄지 않는다 (ADR-0146)."""
    join(runner)
    workspace(center)
    run_id = trial(center, case="고액")
    beat(runner)
    assert runner.free_slots() == runner.settings.max_concurrency, "운영 자리는 그대로다"
    assert runner.free_test_slots() == runner.settings.max_test_concurrency - 1
    wait_for(center, run_id)


def test_the_heartbeat_says_how_many_test_slots_there_are(runner: agent_mod.Agent) -> None:
    """보고하지 않으면 Center가 0으로 보고 **시험을 내려보내지 않는다**."""
    join(runner)
    body = runner._heartbeat_request()
    assert body.capacity.test_max == 2
    assert body.capacity.test_running == 0


def settle(runner: agent_mod.Agent) -> None:
    """설계 일(검사·짓기)이 끝나기를 기다린다 — 스레드로 돈다 (하트비트를 막지 않는다)."""
    for one in list(runner._design):
        one.join(timeout=WAIT_S)
        assert not one.is_alive(), one.name


# ─────────────────────────── 실행 전 검사 ───────────────────────────


def test_a_check_is_asked_and_the_runner_answers(center: TestClient, runner: agent_mod.Agent) -> None:
    """**검사도 실행기가 한다** — 청하면 202이고 결과는 하트비트를 타고 온다 (ADR-0146)."""
    join(runner)
    workspace(center)
    asked = center.post(f"{API}/workspaces/{WS}/check", headers=ADMIN)
    assert asked.status_code == 202, asked.text
    assert asked.json()["state"] == "pending"

    beat(runner)  # 지시가 내려간다
    settle(runner)
    beat(runner)  # 결과가 올라간다
    found = made(center.get(f"{API}/workspaces/{WS}/check", headers=READ), 200)
    assert found["state"] == "done", found
    assert found["checked_revision"].startswith("sha256:")
    assert [one for one in found["violations"] if one["severity"] == "error"] == [], found


def test_the_second_ask_does_not_go_to_the_runner(center: TestClient, runner: agent_mod.Agent) -> None:
    """**되묻지 않는다** — 저장할 때마다 실행기를 거치면 느리다 (ADR-0146의 캐시)."""
    join(runner)
    workspace(center)
    center.post(f"{API}/workspaces/{WS}/check", headers=ADMIN)
    beat(runner)
    settle(runner)
    beat(runner)
    again = made(center.post(f"{API}/workspaces/{WS}/check", headers=ADMIN), 200)
    assert again["cached"] is True
    beat(runner)
    assert runner._design == [] or all(not one.is_alive() for one in runner._design)


def test_a_changed_file_makes_the_old_result_stale(center: TestClient, runner: agent_mod.Agent) -> None:
    """파일이 바뀌면 묶음이 달라진다 — **그 결과는 다른 그림의 것**이라 주지 않는다."""
    join(runner)
    workspace(center)
    center.post(f"{API}/workspaces/{WS}/check", headers=ADMIN)
    beat(runner)
    settle(runner)
    beat(runner)
    made(center.put(f"{API}/workspaces/{WS}/files/cases/또.cases.json", content=b"{}", headers=ADMIN))
    assert center.get(f"{API}/workspaces/{WS}/check", headers=READ).status_code == 404


# ─────────────────────────── 배포 후보로 만들기 ───────────────────────────


def test_the_runner_builds_and_center_registers_it(center: TestClient, runner: agent_mod.Agent) -> None:
    """**짓는 것도 실행기이고 등록은 Center다** — 올린 사람은 단추를 누른 계정이다 (ADR-0146)."""
    join(runner)
    workspace(center)
    asked = center.post(f"{API}/workspaces/{WS}/package", json={}, headers=ADMIN)
    assert asked.status_code == 202, asked.text
    build_id = asked.json()["build_id"]

    beat(runner)
    settle(runner)
    beat(runner)
    found = made(center.get(f"{API}/workspaces/{WS}/builds/{build_id}", headers=READ), 200)
    assert found["state"] == "done", found
    assert found["package_id"] == WS

    listed = made(center.get(f"{API}/packages?id={WS}", headers=ADMIN), 200)
    assert [one["id"] for one in listed] == [WS]
    assert listed[0]["uploaded_by"] == found["requested_by"], "실행기가 아니다"
    assert listed[0]["status"] == "candidate", "후보일 뿐 — 승인·배포는 그대로다"


def test_only_the_runner_may_put_the_artifact(center: TestClient, runner: agent_mod.Agent) -> None:
    """**C5 권한표가 바뀌지 않는 까닭**이 이 길이다 — 콘솔 토큰으로는 올릴 수 없다."""
    join(runner)
    workspace(center)
    build_id = made(center.post(f"{API}/workspaces/{WS}/package", json={}, headers=ADMIN), 202)["build_id"]
    answer = center.post(
        f"{API}/workspaces/{WS}/builds/{build_id}/artifact", content=b"PK", headers=ADMIN
    )
    assert answer.status_code == 403
    assert answer.json()["code"] == "wrong_key_type"


def test_a_workspace_without_an_entry_cannot_be_built(center: TestClient) -> None:
    made(center.post(f"{API}/workspaces", json={"id": WS, "name": "n"}, headers=ADMIN))
    answer = center.post(f"{API}/workspaces/{WS}/package", json={}, headers=ADMIN)
    assert answer.status_code == 422
    assert answer.json()["code"] == "no_entry"


def test_a_shared_process_does_not_need_an_entry(center: TestClient) -> None:
    """**공유 프로세스에는 진입이 없다** (C1 — R1은 `bpm_process`에만 묻는다).

    묻고 있었더니 공유 프로세스를 지을 길이 아예 없었다 — 짓는 쪽은 정의 전부를 담는다
    (`core.testrun.packaging.export_lib`).
    """
    made(center.post(f"{API}/workspaces", json={"id": WS, "name": "n"}, headers=ADMIN))
    answer = center.post(
        f"{API}/workspaces/{WS}/package", json={"kind": "process_lib"}, headers=ADMIN
    )
    assert answer.status_code == 202, answer.text


def test_stopping_a_trial_does_not_judge_it(center: TestClient, runner: agent_mod.Agent) -> None:
    """「중지」는 작업 취소와 **같은 길**이다 (C17 — 자리를 둘로 만들지 않는다)."""
    join(runner)
    workspace(center)
    run_id = trial(center, case="고액")
    beat(runner)
    made(center.delete(f"{API}/workspaces/{WS}/test-runs/{run_id}", headers=ADMIN), 200)
    beat(runner)  # 취소 지시가 내려온다
    found = info(center, run_id)
    assert found["state"] == "cancelled"
    assert found["verdict"] == "중지"
