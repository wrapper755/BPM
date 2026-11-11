"""어댑터 일꾼이 콘솔이 원본인 정의를 Center에서 받아 쓴다 (C15 §콘솔이 원본인 정의 받기, ADR-0141).

Center는 TestClient, 모의 외부 앱 `ext-credit`은 **진짜 소켓**이다 (`test_adapter_consumer`와 같은 까닭).

| 보는 것 | 왜 |
| --- | --- |
| 뜰 때 받아 토픽이 생기고, manifest는 올리지 않고, 주소를 알린다 | 옛 manifest가 고친 판을 막지 않게 |
| 시험 호출이 일꾼을 거쳐 외부 앱까지 가서 답이 돌아온다 | 콘솔 CON-18의 「시험 호출」이 도는 길 |
| 고친 판이 실린 일감은 일꾼이 그 자리에서 다시 받아 그 판으로 부른다 | 다시 띄우지 않는다 (ADR-0141 §4) |
| 옛 판이 실린 일감은 옛 판으로 부른다 | 정의를 고정한 BPM 프로세스 (ADR-0060) |
| 모두 내리면 `definition_unavailable` — 다른 판으로 몰래 부르지 않는다 | C15 |
| 파일 정의와 id가 겹치면 Center 것을 쓴다 | 정의마다 원본은 하나 |
| 봉투가 맞지 않는 판은 쓰지 않는다 | C13 E6 — 실행하는 쪽과 같은 관문 |
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from consumers import serve
from fastapi.testclient import TestClient

from bpm.adapter_consumer.adapter import ENV_PREFIX, AdapterService, ext_env
from bpm.adapter_consumer.console import EXTENSIONS_PATH, ConsoleDefinitions
from bpm.center.app import create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store
from bpm.contracts.extension import ExtensionManifest
from bpm.contracts.external_task import LockedTask
from bpm.mock_apps.external import apps as external_apps
from bpm.mock_apps.external import definitions
from bpm.service_kit import Consumer, TokenFile

API = "/api/v1"
ADMIN = {"Authorization": "Bearer t-admin"}
APP = "ext-credit"
KEY = "ext-secret-1"


@pytest.fixture(scope="module")
def credit() -> Iterator[str]:
    url, server, thread = serve(external_apps.BUILDERS[APP]())
    yield url
    server.should_exit = True
    thread.join(timeout=10)


@pytest.fixture
def center(tmp_path: Path) -> Iterator[TestClient]:
    store = Store(tmp_path / "center.sqlite3")
    settings = Settings(
        db_path=tmp_path / "center.sqlite3",
        package_dir=tmp_path / "packages",
        admin_token="t-admin",
        read_token="t-read",
        consumers_dir=None,
    )
    with TestClient(create_app(settings, store=store)) as made:
        yield made
    store.close()


@pytest.fixture
def outbound() -> Iterator[httpx.Client]:
    with httpx.Client() as made:
        yield made


def console_definition(base: str, **over: Any) -> dict[str, Any]:
    """콘솔이 만드는 정의 — 판은 Center가 정한다."""
    found = definitions.BUILDERS[APP](base)
    found.pop("version", None)
    found.update(over)
    return found


def make(center: TestClient, base: str, **over: Any) -> None:
    body = {"definition": console_definition(base, **over)}
    got = center.post(f"{API}/resources/extensions", json=body, headers=ADMIN)
    assert got.status_code == 201, got.text


def edit(center: TestClient, base: str, version: str, **over: Any) -> str:
    body = {"definition": console_definition(base, **over), "base_version": version}
    got = center.put(f"{API}/resources/extensions/{APP}", json=body, headers=ADMIN)
    assert got.status_code == 200, got.text
    return str(got.json()["version"])


def worker(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, base: str, files: list[AdapterService] | None = None
) -> tuple[Consumer, ConsoleDefinitions]:
    got = center.post(f"{API}/consumers", json={"name": "adapter", "topics": [APP]}, headers=ADMIN)
    assert got.status_code == 201, got.text
    tokens = TokenFile(path=tmp_path / "token.json", env_value=str(got.json()["token"]))
    environ = {f"{ENV_PREFIX}ALLOW_PRIVATE_NETWORK": "1", ext_env(APP, "KEY"): KEY}
    console = ConsoleDefinitions(environ=environ, client=outbound, resolver=lambda host: ["127.0.0.1"])
    consumer = Consumer(list(files or []), center_url="", tokens=tokens, sources=[console], wait_s=0, client=center)
    return consumer, console


def task(**over: Any) -> LockedTask:
    body: dict[str, Any] = {
        "task_id": "et_credit",
        "topic": APP,
        "operation": "lookup",
        "mode": "deterministic",
        "origin": "run",
        "idempotency": {
            "run_id": "run_20261109_090000_a1b2c3", "node_id": "Task_credit", "node_instance": 1, "attempt": 1
        },
        "caller": {"type": "server_runner", "host": "srv_01", "bpm_process_id": "fin.credit", "version": "1.0.0"},
        "input": {"biz_no": "123-45-67890"},
        "lock_until": "2026-11-09T09:10:00+09:00",
        "deadline": "2026-11-09T09:10:00+09:00",
        **over,
    }
    return LockedTask.model_validate(body)


def consumer_info(center: TestClient) -> dict[str, Any]:
    return dict(center.get(f"{API}/consumers", headers=ADMIN).json()[0])


# ─────────────────────────── 받기 ───────────────────────────


def test_the_worker_takes_the_console_definition_and_reports_its_address(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str
) -> None:
    make(center, credit)
    consumer, console = worker(center, tmp_path, outbound, credit)
    consumer.publish(force=True)

    assert consumer.topics == [APP]
    held = console.services[APP]
    assert sorted(held.versions or {}) == ["0.1.0"] and held.publishes_manifest is False
    info = consumer_info(center)
    assert info["apps"] == [], "콘솔 원본에는 manifest도 정의도 올리지 않는다"
    assert info["addresses"][APP]["base_url"] == credit


def test_a_console_test_call_goes_through_the_worker_to_the_app(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str
) -> None:
    # 운영 주소에는 아무도 없다 — 시험 호출은 정의의 시험 주소(`test_base_url`)로 간다 (C7).
    dead = "http://127.0.0.1:9"
    make(center, dead, service={**console_definition(dead)["service"], "test_base_url": credit})
    consumer, _ = worker(center, tmp_path, outbound, credit)
    consumer.publish(force=True)
    assert consumer_info(center)["addresses"][APP]["test_base_url"] == credit
    call = {"operation": "lookup", "input": {"biz_no": "123-45-67890"}, "wait_s": 0}
    started = center.post(f"{API}/resources/extensions/{APP}/test-calls", json=call, headers=ADMIN)
    assert started.status_code == 200, started.text

    assert consumer.run_once(wait_s=0) == 1
    url = f"{API}/resources/extensions/{APP}/test-calls/{started.json()['task_id']}"
    answer = center.get(url, headers=ADMIN).json()
    assert answer["state"] == "completed", answer
    assert answer["output"]["result"]["score"] == 780


# ─────────────────────────── 판 ───────────────────────────


def test_an_edited_version_is_fetched_when_a_task_asks_for_it(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str
) -> None:
    make(center, credit)
    consumer, console = worker(center, tmp_path, outbound, credit)
    consumer.publish(force=True)
    newer = edit(center, credit, "0.1.0", name="신용 조회 2")
    held = console.services[APP]
    assert newer not in (held.versions or {}), "아직 받지 않았다 — 다시 띄우지 않고 일감이 부를 때 받는다"

    done = held.execute(task(definition_version=newer))
    assert done.ok, done.fail_body()
    assert held.definition.version == newer and sorted(held.versions or {}) == ["0.1.0", newer]

    # 정의를 고정한 BPM 프로세스의 일감 — 옛 판으로 부른다 (옛 판은 내려가지 않았다).
    slot = {"run_id": "run_20261109_090000_d4e5f6", "node_id": "Task_credit", "node_instance": 1, "attempt": 1}
    older = held.execute(task(definition_version="0.1.0", idempotency=slot))
    assert older.ok, older.fail_body()


def test_a_revoked_definition_fails_the_task_instead_of_using_another(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str
) -> None:
    make(center, credit)
    consumer, console = worker(center, tmp_path, outbound, credit)
    consumer.publish(force=True)
    newer = edit(center, credit, "0.1.0", name="신용 조회 2")
    assert center.delete(f"{API}/resources/extensions/{APP}", headers=ADMIN).status_code == 200
    held = console.services[APP]

    # 들고 있지 않던 판 — 다시 받아 봐도 없다.
    gone = held.execute(task(definition_version=newer))
    assert not gone.ok and gone.fail_body()["code"] == "definition_unavailable"
    # 다시 받았으니 들고 있던 판도 내려갔다 (주기마다 받는 것도 같다).
    assert held.versions == {}
    gone = held.execute(task(definition_version="0.1.0"))
    assert not gone.ok and gone.fail_body()["code"] == "definition_unavailable"
    consumer.publish()
    assert consumer.topics == [APP], "토픽은 남는다 — 오는 일감이 까닭을 들고 실패한다"


# ─────────────────────────── 원본은 하나 ───────────────────────────


def test_a_file_definition_with_the_same_id_gives_way(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str, caplog: pytest.LogCaptureFixture
) -> None:
    make(center, credit)
    raw = definitions.BUILDERS[APP](credit, version="9.0.0")
    from_file = AdapterService(definition=ExtensionManifest.model_validate(raw), raw=raw)
    consumer, console = worker(center, tmp_path, outbound, credit, files=[from_file])
    consumer.publish(force=True)

    assert consumer.topics == [APP]
    assert consumer.service(APP) is console.services[APP] and console.services[APP] is not from_file
    assert "콘솔이 원본이다" in caplog.text
    versions = center.get(f"{API}/resources/extensions/{APP}/versions", headers=ADMIN).json()
    assert "9.0.0" not in {one["version"] for one in versions}, "파일 것은 올리지 않는다"


def test_a_definition_whose_envelope_does_not_match_is_not_used(
    center: TestClient, tmp_path: Path, outbound: httpx.Client, credit: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    make(center, credit)
    consumer, console = worker(center, tmp_path, outbound, credit)
    real = consumer.get

    def tampered(path: str) -> Any:
        found = real(path)
        if path == EXTENSIONS_PATH:
            # 관리자 토큰만 샌 누군가가 주소를 바꿔치기했다 — 서명은 그대로다.
            found["extensions"][0]["definition"]["service"]["base_url"] = "https://evil.example.com"
        return found

    monkeypatch.setattr(consumer, "get", tampered)
    consumer.publish(force=True)
    assert consumer.topics == [] and APP not in console.services
    assert any("hash_mismatch" in why or "definition_hash" in why for why in console.problems.values())
