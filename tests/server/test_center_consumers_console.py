"""일꾼 관리 — Center 관리자가 콘솔에서 만들고·고치고·지우고, **다시 띄우지 않고** 바로 반영된다 (C15, ADR-0137).

1. 만들면 **토큰 원문은 그 답에만** 있고, 그 토큰으로 바로 맡은 토픽을 가져간다. 같은 이름은 409.
2. 토픽을 바꾸면 **다음 가져가기부터** 새 토픽은 되고 빠진 토픽은 403이다.
3. 토큰을 새로 발급하면 옛 토큰은 바로 거부되고 새 토큰이 된다.
4. 지우면 토큰이 거부되고, 맡을 일꾼이 없어진 외부 확장은 **그 자리에서** 철회된다.
5. Center 관리자만 — 보기 전용·회사 관리자는 못 바꾼다.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_m5_extensions import definition

from bpm.center import accounts
from bpm.center.app import create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store

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


def fetch(client: TestClient, token: str, topics: list[str]) -> Any:
    return client.post("/api/v1/consumers/fetch", json={"topics": topics, "wait_s": 0}, headers=bearer(token))


def upload(client: TestClient, token: str) -> Any:
    return client.put("/api/v1/consumers/self/extension", json={"definition": definition()}, headers=bearer(token))


def create(client: TestClient, name: str = "worker", topics: tuple[str, ...] = ("ext-ocr",)) -> dict[str, Any]:
    got = client.post("/api/v1/consumers", json={"name": name, "topics": list(topics)}, headers=ADMIN)
    assert got.status_code == 201, got.text
    return dict(got.json())


def test_a_worker_made_in_the_console_fetches_at_once(client: TestClient) -> None:
    made = create(client)
    assert made["token"].startswith("bpm_ctr_") and made["key_prefix"] == made["token"][:16]
    assert (made["source"], made["approved_by"]) == ("console", "관리자")

    assert fetch(client, made["token"], ["ext-ocr"]).status_code == 200
    assert fetch(client, made["token"], ["other"]).status_code == 403
    listed = client.get("/api/v1/consumers", headers=READ).json()
    assert [(one["name"], one["topics"]) for one in listed] == [("worker", ["ext-ocr"])]
    assert "token" not in listed[0]  # 원문은 만들 때의 답에만

    got = client.post("/api/v1/consumers", json={"name": "worker", "topics": ["x"]}, headers=ADMIN)
    assert (got.status_code, got.json()["code"]) == (409, "name_taken")
    got = client.post("/api/v1/consumers", json={"name": "bad", "topics": ["대문자 X"]}, headers=ADMIN)
    assert got.status_code == 422


def test_changing_topics_takes_effect_on_the_next_fetch(client: TestClient) -> None:
    made = create(client)
    got = client.put(f"/api/v1/consumers/{made['consumer_id']}", json={"topics": ["other"]}, headers=ADMIN)
    assert got.status_code == 200 and got.json()["topics"] == ["other"]
    assert fetch(client, made["token"], ["other"]).status_code == 200
    assert fetch(client, made["token"], ["ext-ocr"]).status_code == 403


def test_a_new_token_shuts_the_old_one(client: TestClient) -> None:
    made = create(client)
    got = client.post(f"/api/v1/consumers/{made['consumer_id']}/token", headers=ADMIN)
    assert got.status_code == 200
    fresh = got.json()["token"]
    assert fresh != made["token"] and got.json()["consumer_id"] == made["consumer_id"]
    assert fetch(client, made["token"], ["ext-ocr"]).json()["code"] == "key_revoked"
    assert fetch(client, fresh, ["ext-ocr"]).status_code == 200


def test_deleting_shuts_the_token_and_revokes_the_extension_it_held(client: TestClient) -> None:
    made = create(client)
    up = upload(client, made["token"])
    assert up.status_code == 201, up.text
    # 다른 일꾼이 같은 토픽을 맡고 있으면 거두지 않는다.
    other = create(client, "other", ("ext-ocr",))
    assert client.delete(f"/api/v1/consumers/{other['consumer_id']}", headers=ADMIN).status_code == 204
    assert client.get("/api/v1/resources/extensions/ext-ocr", headers=ADMIN).status_code == 200

    assert client.delete(f"/api/v1/consumers/{made['consumer_id']}", headers=ADMIN).status_code == 204
    assert fetch(client, made["token"], ["ext-ocr"]).json()["code"] == "key_revoked"
    assert client.get("/api/v1/resources/extensions/ext-ocr", headers=ADMIN).status_code == 404
    assert client.get("/api/v1/consumers", headers=ADMIN).json() == []
    assert client.delete(f"/api/v1/consumers/{made['consumer_id']}", headers=ADMIN).status_code == 404


def test_dropping_a_topic_revokes_its_extension(client: TestClient) -> None:
    made = create(client, topics=("ext-ocr", "other"))
    up = upload(client, made["token"])
    assert up.status_code == 201
    client.put(f"/api/v1/consumers/{made['consumer_id']}", json={"topics": ["other"]}, headers=ADMIN)
    assert client.get("/api/v1/resources/extensions/ext-ocr", headers=ADMIN).status_code == 404


def test_only_a_center_admin_may_change_workers(client: TestClient) -> None:
    made = create(client)
    body = {"name": "x", "topics": ["x"]}
    assert client.post("/api/v1/consumers", json=body, headers=READ).status_code == 403
    assert client.post(f"/api/v1/consumers/{made['consumer_id']}/token", headers=READ).status_code == 403
    assert client.delete(f"/api/v1/consumers/{made['consumer_id']}", headers=READ).status_code == 403
    # 일꾼 토큰으로도 안 된다.
    assert client.post("/api/v1/consumers", json=body, headers=bearer(made["token"])).status_code == 403

    store = client.app.state.store  # type: ignore[attr-defined]
    client.post("/api/v1/companies", json={"id": "acme", "name": "에이크미"}, headers=ADMIN)
    accounts.create(store, username="acme-admin", password="abcdefgh1234", role="company_admin", by="t", company="acme")
    session = accounts.login(store, username="acme-admin", password="abcdefgh1234").token
    got = client.post("/api/v1/consumers", json=body, headers=bearer(session))
    assert (got.status_code, got.json()["code"]) == (403, "center_admin_only")
