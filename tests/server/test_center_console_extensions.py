"""콘솔에서 고치는 외부 확장 — HTTP 어댑터 앱의 정의는 Center가 원본일 수 있다 (C7·C13·C15, ADR-0141).

1. 만들면 원본이 `console`이고 Center가 봉투에 서명한다. 판을 비우면 `0.1.0`, 같은 id는 409, 어댑터 앱만 받는다.
2. 고치면 **새 판**(끝자리 + 1)이고 옛 판은 남는다. 그 사이 다른 판이 올라왔으면 409 `version_conflict`,
   내용이 같으면 판을 올리지 않는다.
3. 정의마다 원본은 하나다 — 일꾼은 콘솔 원본을 올리지 못하고(409 `source_is_console`), 콘솔은 일꾼 원본을 고치지
   못한다(409 `source_is_consumer`).
4. 일꾼은 맡은 콘솔 원본 정의를 받고(철회하지 않은 판 모두) 쓰는 주소를 알린다. 일감에는 부를 판이 실린다 —
   정의를 고정한 BPM 프로세스면 그 판이다.
5. 내리면 판을 모두 철회하고, 맡은 일꾼이 없어져도 콘솔 원본은 거두지 않는다.
6. 시험 호출은 Center가 `origin: test` 일감을 스스로 올리고, 일꾼이 끝내면 답을 준다.
7. Center 관리자만 쓴다.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_m5_extensions import definition

from bpm.center.app import create_app
from bpm.center.migrations import MIGRATIONS, migrate
from bpm.center.settings import Settings
from bpm.center.storage import SCHEMA, Store, now_iso
from bpm.contracts.extension import definition_hash, verify_external
from bpm.contracts.signing import AdminKey, Envelope

API = "/api/v1"
ADMIN = {"Authorization": "Bearer t-admin"}
READ = {"Authorization": "Bearer t-read"}


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
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


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def adapter(**over: Any) -> dict[str, Any]:
    """콘솔이 만드는 HTTP 어댑터 앱 — 판은 Center가 정한다."""
    found = definition(**over)
    found.pop("version", None)
    return dict(found)


def make(client: TestClient, **over: Any) -> dict[str, Any]:
    got = client.post(f"{API}/resources/extensions", json={"definition": adapter(**over)}, headers=ADMIN)
    assert got.status_code == 201, got.text
    return dict(got.json())


def worker(client: TestClient, name: str = "worker", topics: tuple[str, ...] = ("ext-ocr",)) -> str:
    got = client.post(f"{API}/consumers", json={"name": name, "topics": list(topics)}, headers=ADMIN)
    assert got.status_code == 201, got.text
    return str(got.json()["token"])


def edit(client: TestClient, base: str, **over: Any) -> Any:
    return client.put(
        f"{API}/resources/extensions/ext-ocr",
        json={"definition": adapter(**over), "base_version": base},
        headers=ADMIN,
    )


def renamed(name: str) -> dict[str, Any]:
    return {"name": name}


# ─────────────────────────── 1·2 만들기·고치기 ───────────────────────────


def test_creating_signs_a_console_definition(client: TestClient) -> None:
    made = make(client)
    assert (made["id"], made["version"], made["source"]) == ("ext-ocr", "0.1.0", "console")
    assert made["envelope"]["payload"]["definition_hash"] == definition_hash(made["definition"])

    got = client.post(f"{API}/resources/extensions", json={"definition": adapter()}, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (409, "id_conflict")
    not_adapter = adapter(id="ext-other", service={"protocol": "bpm-c11"})
    got = client.post(f"{API}/resources/extensions", json={"definition": not_adapter}, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (422, "input_invalid")
    # 관문은 일꾼이 올릴 때와 같다 — E3(허용 호스트 밖의 주소)를 그대로 막는다.
    unsafe = adapter(id="ext-bad")
    unsafe["service"] = {**unsafe["service"], "base_url": "http://elsewhere.example.com"}
    got = client.post(f"{API}/resources/extensions", json={"definition": unsafe}, headers=ADMIN)
    assert got.status_code == 422


def test_editing_makes_a_new_version_and_keeps_the_old(client: TestClient) -> None:
    make(client)
    got = edit(client, "0.1.0", **renamed("외부 OCR 2"))
    assert got.status_code == 200, got.text
    assert (got.json()["version"], got.json()["name"]) == ("0.1.1", "외부 OCR 2")

    # 같은 내용이면 판을 올리지 않는다.
    same = edit(client, "0.1.1", **renamed("외부 OCR 2"))
    assert same.status_code == 200 and same.json()["version"] == "0.1.1"
    # 그 사이 판이 올라갔다 — 덮어쓰지 않는다.
    stale = edit(client, "0.1.0", **renamed("외부 OCR 3"))
    assert (stale.status_code, stale.json()["code"]) == (409, "version_conflict")
    assert stale.json()["detail"]["current_version"] == "0.1.1"
    # id는 토픽이라 바꾸지 못한다.
    moved = client.put(
        f"{API}/resources/extensions/ext-ocr",
        json={"definition": adapter(id="ext-x"), "base_version": "0.1.1"},
        headers=ADMIN,
    )
    assert moved.status_code == 422

    history = client.get(f"{API}/resources/extensions/ext-ocr/versions", headers=READ).json()
    assert [one["version"] for one in history] == ["0.1.1", "0.1.0"]
    assert {one["registered_by"] for one in history} == {"관리자"}
    assert all(one.get("revoked_at") is None for one in history)


# ─────────────────────────── 3 원본은 하나 ───────────────────────────


def test_one_source_per_definition(client: TestClient) -> None:
    make(client)
    token = worker(client)
    got = client.put(f"{API}/consumers/self/extension", json={"definition": definition()}, headers=bearer(token))
    assert (got.status_code, got.json()["code"]) == (409, "source_is_console")

    other = worker(client, "other", ("ext-file",))
    got = client.put(
        f"{API}/consumers/self/extension", json={"definition": definition(id="ext-file")}, headers=bearer(other)
    )
    assert got.status_code == 201, got.text
    assert got.json()["source"] == "consumer"
    body = {"definition": definition(id="ext-file"), "base_version": "1.0.0"}
    got = client.put(f"{API}/resources/extensions/ext-file", json=body, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (409, "source_is_consumer")
    got = client.delete(f"{API}/resources/extensions/ext-file", headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (409, "source_is_consumer")
    got = client.post(f"{API}/resources/extensions", json={"definition": adapter(id="ext-file")}, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (409, "id_conflict")


def test_old_worker_rows_read_as_consumer(tmp_path: Path) -> None:
    """옛 저장소의 `worker`는 27판에서 `consumer`가 된다 (ADR-0141)."""
    conn = sqlite3.connect(tmp_path / "old.sqlite3")
    migrate(conn, baseline=SCHEMA, steps=MIGRATIONS[:25])  # 26판까지
    conn.execute(
        "INSERT INTO extensions (id, version, definition_json, envelope_json, definition_hash, at, source,"
        " registered_by) VALUES ('ext-ocr', '1.0.0', '{}', '{}', 'h', 'now', 'worker', 't')"
    )
    conn.commit()
    migrate(conn, baseline=SCHEMA)
    assert conn.execute("SELECT source FROM extensions").fetchone() == ("consumer",)
    assert "definition_version" in {row[1] for row in conn.execute("PRAGMA table_info(external_tasks)")}
    conn.close()


# ─────────────────────────── 4 일꾼이 받는다 ───────────────────────────


def test_the_worker_fetches_console_definitions_and_reports_its_address(client: TestClient) -> None:
    make(client)
    edit(client, "0.1.0", **renamed("외부 OCR 2"))
    token = worker(client, topics=("ext-ocr", "ext-none"))
    got = client.get(f"{API}/consumers/self/extensions", headers=bearer(token))
    assert got.status_code == 200
    held = got.json()["extensions"]
    assert [(one["id"], one["version"], one["source"]) for one in held] == [
        ("ext-ocr", "0.1.1", "console"),
        ("ext-ocr", "0.1.0", "console"),
    ]
    # 일꾼이 봉투를 다시 검증할 수 있다 — 같이 온 공개키로 (C13 E6).
    keys = [AdminKey.model_validate(one) for one in got.json()["keys"]]
    for one in held:
        assert verify_external(one["definition"], Envelope.model_validate(one["envelope"]), keys=keys) == []
    # 맡지 않은 토픽의 정의는 오지 않는다.
    stranger = worker(client, "stranger", ("ext-none",))
    assert client.get(f"{API}/consumers/self/extensions", headers=bearer(stranger)).json()["extensions"] == []

    body = {"extension_id": "ext-ocr", "address": {"base_url": "https://user:pw@ocr.internal/v1?x=1"}}
    got = client.put(f"{API}/consumers/self/address", json=body, headers=bearer(token))
    assert got.status_code == 200, got.text
    assert got.json()["addresses"]["ext-ocr"]["base_url"] == "https://ocr.internal/v1"
    body = {"extension_id": "ext-else", "address": {"base_url": "https://x.example.com"}}
    assert client.put(f"{API}/consumers/self/address", json=body, headers=bearer(token)).status_code == 403


def _package(store: Store, package_id: str, version: str, need: dict[str, Any]) -> None:
    """요구만 담은 BPM 프로세스 패키지와 살아 있는 배포 하나 — 읽는 쪽(쓰는 곳·부를 판)만 본다."""
    manifest = {"id": package_id, "version": version, "requires": {"extensions": [need]}}
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO packages (id, version, kind, status, content_hash, manifest_json, file_name, size_bytes,"
            " uploaded_at, uploaded_by) VALUES (?, ?, 'bpm_process', 'approved', 'h', ?, 'f.zip', 1, ?, 't')",
            (package_id, version, json.dumps(manifest), now_iso()),
        )
        cur.execute(
            "INSERT INTO deployments (deployment_id, target_type, target_id, bpm_process_id, version, content_hash,"
            " envelope_json, at) VALUES (?, 'server_runner', '*', ?, ?, 'h', '{}', ?)",
            (f"dep_{package_id}", package_id, version, now_iso()),
        )


def test_dependents_and_the_version_a_task_calls(client: TestClient) -> None:
    first = make(client)
    edit(client, "0.1.0", **renamed("외부 OCR 2"))
    store: Store = client.app.state.store  # type: ignore[attr-defined]
    pin = {"id": "ext-ocr", "version": ">=0.1", "definition_hash": first["definition_hash"]}
    _package(store, "pinned", "1.0.0", pin)
    _package(store, "loose", "1.0.0", {"id": "ext-ocr", "version": ">=0.1"})
    _package(store, "unrelated", "1.0.0", {"id": "ext-else", "version": ">=0.1"})

    got = client.get(f"{API}/resources/extensions/ext-ocr/dependents", headers=READ).json()
    assert [(one["package_id"], one["deployments"], one.get("pinned_version")) for one in got] == [
        ("loose", 1, None),
        ("pinned", 1, "0.1.0"),
    ]

    from bpm.center.api import resources  # noqa: PLC0415

    assert resources.definition_version_for(store, "ext-ocr", bpm_process_id="pinned", version="1.0.0") == "0.1.0"
    assert resources.definition_version_for(store, "ext-ocr", bpm_process_id="loose", version="1.0.0") == "0.1.1"
    assert resources.definition_version_for(store, "ext-ocr", bpm_process_id=None, version=None) == "0.1.1"


# ─────────────────────────── 5 내리기 ───────────────────────────


def test_revoking_withdraws_every_version_and_workers_do_not(client: TestClient) -> None:
    make(client)
    edit(client, "0.1.0", **renamed("외부 OCR 2"))
    worker(client)
    consumer = client.get(f"{API}/consumers", headers=ADMIN).json()[0]
    # 맡은 일꾼이 없어져도 콘솔 원본은 거두지 않는다 (C13).
    assert client.delete(f"{API}/consumers/{consumer['consumer_id']}", headers=ADMIN).status_code == 204
    assert client.get(f"{API}/resources/extensions/ext-ocr", headers=READ).status_code == 200

    got = client.delete(f"{API}/resources/extensions/ext-ocr", headers=ADMIN)
    assert got.status_code == 200 and sorted(got.json()["revoked"]) == ["0.1.0", "0.1.1"]
    assert client.get(f"{API}/resources/extensions/ext-ocr", headers=READ).status_code == 404
    history = client.get(f"{API}/resources/extensions/ext-ocr/versions", headers=READ).json()
    assert all(one.get("revoked_at") and one.get("revoked_by") == "관리자" for one in history)
    # 되살리지 않는다.
    assert (edit(client, "0.1.1").json()["code"]) == "extension_revoked"
    got = client.post(f"{API}/resources/extensions", json={"definition": adapter()}, headers=ADMIN)
    assert got.json()["code"] == "id_conflict"


# ─────────────────────────── 6 시험 호출 ───────────────────────────


def test_a_test_call_goes_through_the_worker(client: TestClient) -> None:
    make(client)
    call = {"operation": "read_invoice", "input": {"file_url": "https://x"}, "wait_s": 0}
    got = client.post(f"{API}/resources/extensions/ext-ocr/test-calls", json=call, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (422, "no_consumer")

    token = worker(client)
    got = client.post(
        f"{API}/resources/extensions/ext-ocr/test-calls", json={**call, "operation": "nope"}, headers=ADMIN
    )
    assert (got.status_code, got.json()["code"]) == (422, "operation_not_found")

    got = client.post(f"{API}/resources/extensions/ext-ocr/test-calls", json=call, headers=ADMIN)
    assert got.status_code == 200, got.text
    started = got.json()
    assert (started["state"], started["version"]) == ("pending", "0.1.0")

    fetched = client.post(f"{API}/consumers/fetch", json={"topics": ["ext-ocr"], "wait_s": 0}, headers=bearer(token))
    task = fetched.json()["tasks"][0]
    assert (task["task_id"], task["origin"], task["definition_version"]) == (started["task_id"], "test", "0.1.0")
    assert task["caller"]["type"] == "console"
    done = client.post(
        f"{API}/consumers/tasks/{task['task_id']}/complete", json={"output": {"biz_no": "123"}}, headers=bearer(token)
    )
    assert done.status_code == 200, done.text

    url = f"{API}/resources/extensions/ext-ocr/test-calls/{started['task_id']}"
    answer = client.get(url, headers=ADMIN).json()
    assert (answer["state"], answer["output"]) == ("completed", {"biz_no": "123"})
    # 값은 받은 뒤 지운다.
    assert client.get(url, headers=ADMIN).json().get("output") is None
    assert client.get(f"{API}/resources/extensions/ext-ocr/test-calls/xt_{'0' * 24}", headers=ADMIN).status_code == 404


# ─────────────────────────── 7 권한 ───────────────────────────


def test_only_a_center_admin_writes(client: TestClient) -> None:
    body = {"definition": adapter()}
    assert client.post(f"{API}/resources/extensions", json=body, headers=READ).status_code == 403
    make(client)
    assert edit(client, "0.1.0").status_code in (200, 409)
    got = client.put(
        f"{API}/resources/extensions/ext-ocr", json={"definition": adapter(), "base_version": "0.1.0"}, headers=READ
    )
    assert got.status_code == 403
    assert client.delete(f"{API}/resources/extensions/ext-ocr", headers=READ).status_code == 403
    call = {"operation": "read_invoice", "wait_s": 0}
    assert client.post(f"{API}/resources/extensions/ext-ocr/test-calls", json=call, headers=READ).status_code == 403
    assert client.get(f"{API}/resources/extensions/ext-ocr/versions", headers=READ).status_code == 200
