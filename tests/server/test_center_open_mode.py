"""열린 모드 — 콘솔 로그인만 남기고 키 등록·등록 승인을 건너뛴다 (ADR-0142).

보는 것 셋이다.

- **등록 요청이 받는 자리에서 승인된다** (C4·C12·C5 §등록 승인) — 회사가 하나뿐일 때만.
- **일꾼이 모르는 토큰으로 스스로 들어온다** (C15 §일꾼 들이기)고, 스위치를 끈 뒤에도 돈다.
- **키 없는 호출이 관리자**이고 **모르는 토큰은 그대로 401**이다 (C5 §인증).

기본값이 꺼짐인 것도 같은 자리에서 본다 — 켜지 않은 Center가 예전처럼 막는가.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store
from bpm.contracts.enrollment import EnrollStatus, new_keypair, open_sealed

API = "/api/v1"
ADMIN = {"Authorization": "Bearer t-admin"}


@pytest.fixture
def store() -> Iterator[Store]:
    found = Store(Path(":memory:"))
    yield found
    found.close()


def app_for(store: Store, tmp_path: Path, *, open_mode: bool) -> TestClient:
    settings = Settings(
        admin_token="t-admin", read_token="t-read", package_dir=tmp_path / "packages", open_mode=open_mode
    )
    return TestClient(create_app(settings, store=store))


@pytest.fixture
def open_client(store: Store, tmp_path: Path) -> Iterator[TestClient]:
    with app_for(store, tmp_path, open_mode=True) as found:
        yield found


@pytest.fixture
def shut_client(store: Store, tmp_path: Path) -> Iterator[TestClient]:
    with app_for(store, tmp_path, open_mode=False) as found:
        yield found


def machine(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()


def bot_body(public_key: str, *, seed: str = "pc1") -> dict[str, Any]:
    return {
        "schema": 1,
        "machine_id": machine(seed),
        "name": "현장 PC 1",
        "os": "windows-11-23H2",
        "versions": {"bot_ui": "0.1.0", "core": "0.1.0"},
        "public_key": public_key,
    }


def runner_body(public_key: str) -> dict[str, Any]:
    return {
        "schema": 1,
        "machine_id": machine("srv1"),
        "name": "서버 1",
        "os": "ubuntu-24.04",
        "versions": {"server_runner": "0.1.0", "core": "0.1.0"},
        "public_key": public_key,
    }


def enroll(client: TestClient, body: dict[str, Any], *, kind: str) -> EnrollStatus:
    response = client.post(f"{API}/{kind}/enroll", json=body)
    assert response.status_code == 201, response.text
    return EnrollStatus.model_validate(response.json())


# ─────────────── 설정 ───────────────


def test_open_mode_is_off_unless_the_env_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BPM_CENTER__OPEN_MODE", raising=False)
    assert Settings().open_mode is False
    assert Settings.from_env().open_mode is False
    for value in ("1", "true", "TRUE", "yes", "on"):
        monkeypatch.setenv("BPM_CENTER__OPEN_MODE", value)
        assert Settings.from_env().open_mode is True, value
    for value in ("", "0", "false", "아니오"):
        monkeypatch.setenv("BPM_CENTER__OPEN_MODE", value)
        assert Settings.from_env().open_mode is False, value


def test_healthz_says_whether_it_is_open(open_client: TestClient, shut_client: TestClient) -> None:
    """콘솔 배지(CON-00)가 읽는 자리다 — 인증이 없다 (ADR-0142 §5)."""
    assert open_client.get("/healthz").json()["open_mode"] is True
    assert shut_client.get("/healthz").json()["open_mode"] is False


# ─────────────── 등록 요청 ───────────────


def test_an_enrolling_pc_is_approved_where_it_asks(open_client: TestClient) -> None:
    private, public = new_keypair()
    found = enroll(open_client, bot_body(public), kind="bot-ui")
    # 승인 대기를 지나지 않는다 — 봉한 키가 그 답에 실려 온다.
    assert found.state == "approved"
    assert found.sealed_key is not None
    raw = open_sealed(private, found.sealed_key, salt=found.enrollment_id)
    assert raw.startswith("bpm_ctr_")
    # 「누가 승인했나」는 열린 모드다 (들이기 비밀의 `join_token`과 같은 결).
    listed = open_client.get(f"{API}/enrollments?state=approved", headers=ADMIN).json()
    assert [one["decided_by"] for one in listed] == ["open_mode"]
    # 받은 키로 바로 등록한다 — 그 뒤는 평소와 같다.
    registered = open_client.post(
        f"{API}/bot-ui/register",
        json={"schema": 1, "machine_id": machine("pc1"), "name": "현장 PC 1", "os": "windows-11-23H2",
              "versions": {"bot_ui": "0.1.0", "core": "0.1.0"}},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert registered.status_code in (200, 201), registered.text


def test_studio_and_the_server_runner_come_in_the_same_way(open_client: TestClient) -> None:
    _, public = new_keypair()
    studio = enroll(
        open_client,
        {"schema": 1, "machine_id": machine("stu1"), "name": "설계 PC", "os": "windows-11-23H2",
         "versions": {"studio": "0.1.0", "core": "0.1.0"}, "public_key": public},
        kind="studio",
    )
    assert studio.state == "approved"
    runner = enroll(open_client, runner_body(public), kind="server-runner")
    assert runner.state == "approved"


def test_a_wrong_join_token_is_still_refused_when_open(open_client: TestClient) -> None:
    """틀린 설정이 조용히 지나가지 않는다 (ADR-0117 §2 그대로)."""
    _, public = new_keypair()
    response = open_client.post(
        f"{API}/server-runner/enroll", json=runner_body(public), headers={"X-BPM-Join-Token": "wrong-join-token"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "join_token_invalid"


def test_two_companies_leave_the_pc_waiting_but_not_the_server_runner(open_client: TestClient) -> None:
    """누구의 장비인지는 짐작하지 않는다 (C16) — 서버 실행기는 Center 공용이라 상관없다."""
    made = open_client.post(f"{API}/companies", json={"id": "company2", "name": "회사2"}, headers=ADMIN)
    assert made.status_code in (200, 201), made.text
    _, public = new_keypair()
    assert enroll(open_client, bot_body(public), kind="bot-ui").state == "pending"
    assert enroll(open_client, runner_body(public), kind="server-runner").state == "approved"


def test_a_shut_center_still_waits_for_an_approval(shut_client: TestClient) -> None:
    _, public = new_keypair()
    found = enroll(shut_client, bot_body(public), kind="bot-ui")
    assert found.state == "pending"
    assert found.sealed_key is None


# ─────────────── 인증 ───────────────


def test_a_call_without_a_token_is_an_admin_when_open(open_client: TestClient, shut_client: TestClient) -> None:
    assert shut_client.get(f"{API}/accounts").status_code == 401
    answer = open_client.get(f"{API}/accounts")
    assert answer.status_code == 200, answer.text
    # 행위자는 자칭이다 (`X-BPM-Actor`) — 없으면 「열린 모드」.
    assert open_client.get(f"{API}/deployments").status_code == 200


def test_an_unknown_token_is_still_rejected_when_open(open_client: TestClient) -> None:
    """열린 모드가 오타를 관리자로 만들지 않는다 (ADR-0142 §3)."""
    answer = open_client.get(f"{API}/accounts", headers={"Authorization": "Bearer bpm_ctr_typo"})
    assert answer.status_code == 401
    assert answer.json()["code"] == "key_invalid"


# ─────────────── 일꾼 ───────────────


def fetch(client: TestClient, token: str, **body: Any) -> Any:
    return client.post(
        f"{API}/consumers/fetch",
        json={"topics": ["sample-app"], "max_tasks": 0, "wait_s": 0, **body},
        headers={"Authorization": f"Bearer {token}"},
    )


def test_a_consumer_lets_itself_in_when_open(open_client: TestClient) -> None:
    token = "bpm_ctr_" + "a" * 40
    answer = fetch(open_client, token, name="통합 일꾼")
    assert answer.status_code == 200, answer.text
    assert answer.json()["tasks"] == []
    listed = open_client.get(f"{API}/consumers", headers=ADMIN).json()
    # 「누가」가 사람이 아니고 들어온 길이 드러난다 — 콘솔에서 만든 것처럼 보이지 않는다 (ADR-0142 §2).
    assert [(one["name"], one["topics"], one["source"], one["approved_by"]) for one in listed] == [
        ("통합 일꾼", ["sample-app"], "open", "열린 모드")
    ]
    # 종류는 정하지 않은 일꾼이다 — 관리자가 CON-17에서 정한다 (ADR-0139).
    assert listed[0]["kinds"] is None
    # 두 번째 가져가기는 **들이지 않는다** — 아는 토큰이다.
    assert fetch(open_client, token).status_code == 200
    assert len(open_client.get(f"{API}/consumers", headers=ADMIN).json()) == 1
    # 이름을 비우면 첫 토픽이 이름이다.
    assert fetch(open_client, "bpm_ctr_" + "b" * 40, topics=["other-app"]).status_code == 200
    assert {one["name"] for one in open_client.get(f"{API}/consumers", headers=ADMIN).json()} == {
        "통합 일꾼",
        "other-app",
    }


def test_a_taken_name_does_not_turn_the_intake_into_an_error(open_client: TestClient) -> None:
    """콘솔에서 만든 일꾼과 이름이 부딪혀도 들어온다 — 스스로 들어오는 길에는 사람이 고칠 자리가 없다."""
    made = open_client.post(f"{API}/consumers", json={"name": "통합 일꾼", "topics": ["taken"]}, headers=ADMIN)
    assert made.status_code in (200, 201), made.text
    assert fetch(open_client, "bpm_ctr_" + "e" * 40, name="통합 일꾼").status_code == 200
    listed = open_client.get(f"{API}/consumers", headers=ADMIN).json()
    assert {(one["name"], one["source"]) for one in listed} == {("통합 일꾼", "console"), ("통합 일꾼-2", "open")}


def test_a_revoked_token_does_not_come_back_as_a_new_consumer(open_client: TestClient) -> None:
    """지운 일꾼의 토큰으로 다시 부르면 들이지 않는다 — 폐기된 토큰은 되살아나지 않는다 (ADR-0137)."""
    token = "bpm_ctr_" + "f" * 40
    assert fetch(open_client, token, name="잠깐 일꾼").status_code == 200
    one = open_client.get(f"{API}/consumers", headers=ADMIN).json()[0]
    assert open_client.delete(f"{API}/consumers/{one['consumer_id']}", headers=ADMIN).status_code in (200, 204)
    again = fetch(open_client, token)
    assert (again.status_code, again.json()["code"]) == (403, "key_revoked")
    assert open_client.get(f"{API}/consumers", headers=ADMIN).json() == []


def test_a_consumer_that_came_in_open_keeps_working_after_the_switch_is_off(
    store: Store, tmp_path: Path
) -> None:
    """들어온 뒤로는 콘솔에서 만든 일꾼과 같은 행이다 — 스위치가 그 행을 쥐고 있지 않다."""
    token = "bpm_ctr_" + "c" * 40
    with app_for(store, tmp_path, open_mode=True) as open_client:
        assert fetch(open_client, token, name="일꾼").status_code == 200
    # 스위치를 끈 Center가 다시 뜬다 (일꾼 폴더를 다시 읽는 자리를 지난다).
    with app_for(store, tmp_path, open_mode=False) as shut:
        assert fetch(shut, token).status_code == 200
        assert len(shut.get(f"{API}/consumers", headers=ADMIN).json()) == 1


def test_a_shut_center_does_not_let_a_consumer_in(shut_client: TestClient) -> None:
    answer = fetch(shut_client, "bpm_ctr_" + "d" * 40)
    assert answer.status_code == 401
    assert shut_client.get(f"{API}/consumers", headers=ADMIN).json() == []
