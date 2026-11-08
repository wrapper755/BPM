"""통합 일꾼 (ADR-0135 §4) — 업무 처리기를 엔트리 포인트로 찾고, 외부 확장 정의와 함께 종류별 토픽을 맡는다.

| 무엇을 | 왜 |
| --- | --- |
| 처리기 찾기 — 설정 칸·데이터 폴더를 주고, 깨진 것만 끈다 | 바깥 저장소의 코드라 하나가 터져도 나머지는 돌아야 한다 |
| 같은 토픽을 둘이 맡으면 뜨지 않는다 | Center는 토픽마다 manifest 하나 — 어느 쪽이 받을지 조용히 갈린다 |
| `ai`·`api`·`rpa`가 종류별로 묶인다 | 일꾼 콘솔·로그가 그것으로 보인다 |
| Center를 거쳐 끝까지 — 일감의 종류가 manifest대로 | C15 `kind`는 Center가 manifest에서 붙인다 |
"""

from __future__ import annotations

from collections.abc import Iterator
from importlib.metadata import EntryPoint
from pathlib import Path
from typing import Any

import pytest
from consumers import ADMIN, enroll
from fake_handlers import BROKEN, FACTORY, MANIFEST, TOPIC
from fastapi.testclient import TestClient

from bpm.adapter_consumer.main import service_of
from bpm.center.app import create_app as create_center
from bpm.center.settings import Settings as CenterSettings
from bpm.center.storage import Store
from bpm.service_kit import Consumer
from bpm.unified_consumer import ENTRY_POINT_GROUP, TopicClash, UnifiedConsumer, load
from bpm.unified_consumer.main import main

RUN = "test_20261108_000000_aaaaaa"

EXTERNAL: dict[str, Any] = {
    "schema": 2,
    "id": "ext-credit",
    "version": "1.0.0",
    "name": "외부 신용 조회",
    "publisher": "외부 업체",
    "tier": "external",
    "service": {
        "protocol": "http-adapter",
        "base_url": "https://credit.example.com",
        "adapter": {
            "allowed_hosts": ["credit.example.com"],
            "operations": [
                {
                    "name": "check_credit",
                    "modes": ["deterministic"],
                    "request": {"method": "GET", "path": "/v1/credit/{{input.biz_no}}"},
                    "response": {"output": {"grade": "$.grade"}},
                }
            ],
        },
    },
}


def points(*pairs: tuple[str, str]) -> Any:
    return lambda: [EntryPoint(name=name, value=value, group=ENTRY_POINT_GROUP) for name, value in pairs]


def test_a_handler_package_gets_its_setting_and_folder(tmp_path: Path) -> None:
    environ = {"BPM_CONSUMER__HANDLERS__FAKE_CO__PREFIX": "PO"}
    loaded, failures = load(data_dir=tmp_path, environ=environ, found=points(("fake-co", FACTORY)))
    assert failures == []
    assert [(one.name, [s.app_id for s in one.services]) for one in loaded] == [("fake-co", [TOPIC])]
    assert (tmp_path / "fake-co" / "started").read_text(encoding="utf-8") == "1", "제 폴더를 받는다"


def test_a_broken_handler_package_is_left_off_and_the_rest_runs(tmp_path: Path) -> None:
    loaded, failures = load(data_dir=tmp_path, found=points(("broken", BROKEN), ("fake-co", FACTORY)))
    assert [one.name for one in loaded] == ["fake-co"]
    assert [(one.name, "회사 시스템 주소가 없다" in one.message) for one in failures] == [("broken", True)]


def test_only_the_enabled_handlers_run_and_a_missing_name_is_reported(tmp_path: Path) -> None:
    loaded, failures = load(
        data_dir=tmp_path, enabled=["fake-co", "company9"], found=points(("broken", BROKEN), ("fake-co", FACTORY))
    )
    assert [one.name for one in loaded] == ["fake-co"], "켜지 않은 처리기는 부르지도 않는다"
    assert [one.name for one in failures] == ["company9"]


def test_ai_api_and_rpa_topics_are_grouped_by_kind(tmp_path: Path) -> None:
    loaded, _ = load(data_dir=tmp_path, found=points(("fake-co", FACTORY)))
    host = UnifiedConsumer.assemble(loaded, [service_of(EXTERNAL)])
    seen = host.describe()
    assert seen["by_kind"] == {
        "ai": ["fake-company.draft_review"],
        "api": ["ext-credit.check_credit"],
        "rpa": ["fake-company.enter_order"],
    }
    assert [(one["topic"], one["source"]) for one in seen["topics"]] == [
        ("fake-company", "fake-co"),
        ("ext-credit", "adapter"),
    ]


def test_two_owners_of_one_topic_refuse_to_start(tmp_path: Path) -> None:
    loaded, _ = load(data_dir=tmp_path, found=points(("a", FACTORY), ("b", FACTORY)))
    with pytest.raises(TopicClash, match="fake-company"):
        UnifiedConsumer.assemble(loaded, [])


def test_without_anything_to_take_it_does_not_start(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BPM_CONSUMER__DEFINITIONS", raising=False)
    assert main(["--data-dir", str(tmp_path), "--handlers", "nothing-installed"]) == 1


# ─────────────────────────── Center를 거쳐 ───────────────────────────


@pytest.fixture
def center(tmp_path: Path) -> Iterator[TestClient]:
    store = Store(tmp_path / "center.sqlite3")
    settings = CenterSettings(admin_token="t-admin", package_dir=tmp_path / "pkg")
    with TestClient(create_center(settings, store=store)) as found:
        yield found
    store.close()


def test_the_unified_consumer_finishes_ai_and_rpa_tasks_through_center(center: TestClient, tmp_path: Path) -> None:
    loaded, _ = load(data_dir=tmp_path / "handlers", found=points(("fake-co", FACTORY)))
    host = UnifiedConsumer.assemble(loaded, [])
    tokens = enroll(center, topics=[TOPIC], manifests=[MANIFEST.to_json_dict()], folder=tmp_path / "consumer")
    consumer = Consumer(host.services, center_url="", tokens=tokens, wait_s=0, client=center)

    made = center.post("/api/v1/center-keys", json={"name": "설계자", "type": "studio"}, headers=ADMIN)
    studio = {"Authorization": f"Bearer {made.json()['key']}"}

    def post(operation: str, node: str, payload: dict[str, Any]) -> str:
        body = {
            "schema": 1,
            "topic": TOPIC,
            "operation": operation,
            "mode": "deterministic",
            "origin": "test",
            "idempotency": {"run_id": RUN, "node_id": node, "node_instance": 1, "attempt": 1},
            "caller": {"type": "studio", "host": "설계자 PC"},
            "input": payload,
        }
        answer = center.post("/api/v1/external-tasks", json=body, headers=studio)
        assert answer.status_code == 201, answer.text
        return str(answer.json()["task_id"])

    review = post("draft_review", "Task_review", {"amount": 300})
    order = post("enter_order", "Task_enter", {"order_id": "7"})
    assert consumer.run_once(wait_s=0) + consumer.run_once(wait_s=0) == 2

    outputs = {
        task_id: center.get(f"/api/v1/external-tasks/{task_id}", headers=studio).json() for task_id in (review, order)
    }
    assert outputs[review]["output"] == {"decision": "approve"}
    assert outputs[order]["output"] == {"receipt": "ORD-7"}
    listed = center.get(f"/api/v1/external-tasks?run_id={RUN}", headers=ADMIN).json()
    assert {one["operation"]: one["kind"] for one in listed} == {"draft_review": "ai", "enter_order": "rpa"}


# ─────────────────────────── 관리 API (일꾼 콘솔 = 서비스 앱 콘솔) ───────────────────────────


def test_the_admin_api_lists_every_topics_operations_with_kind_and_counts_per_topic(
    center: TestClient, tmp_path: Path
) -> None:
    """SVC-01이 그대로 그린다 — 작업 줄에 `topic`·`kind`, 수는 토픽마다 (C11, ADR-0135)."""
    from bpm.service_kit import InMemoryUsageLog  # noqa: PLC0415
    from bpm.unified_consumer.admin import APP_ID, create_admin_app, recorded  # noqa: PLC0415

    loaded, _ = load(data_dir=tmp_path / "handlers", found=points(("fake-co", FACTORY)))
    host = UnifiedConsumer.assemble(loaded, [service_of(EXTERNAL)])
    usage = InMemoryUsageLog()
    services = recorded(host.services, usage)
    tokens = enroll(
        center, topics=[TOPIC], manifests=[MANIFEST.to_json_dict()], folder=tmp_path / "consumer"
    )
    consumer = Consumer(services[:1], center_url="", tokens=tokens, wait_s=0, client=center)
    made = center.post("/api/v1/center-keys", json={"name": "설계자", "type": "studio"}, headers=ADMIN)
    studio = {"Authorization": f"Bearer {made.json()['key']}"}
    calls: list[tuple[str, str, dict[str, Any]]] = [
        ("Task_a", "draft_review", {"amount": 10}),
        ("Task_b", "enter_order", {}),
    ]
    for node, operation, payload in calls:
        body = {
            "schema": 1, "topic": TOPIC, "operation": operation, "mode": "deterministic", "origin": "test",
            "idempotency": {"run_id": RUN, "node_id": node, "node_instance": 1, "attempt": 1},
            "caller": {"type": "studio", "host": "설계자 PC"}, "input": payload,
        }
        assert center.post("/api/v1/external-tasks", json=body, headers=studio).status_code == 201
    consumer.run_once(wait_s=0)
    consumer.run_once(wait_s=0)

    admin = TestClient(create_admin_app(services, admin_token="t-consumer", log=usage))
    assert admin.get("/admin/v1/status").status_code == 401
    seen = admin.get("/admin/v1/status", headers={"Authorization": "Bearer t-consumer"}).json()
    assert seen["app_id"] == APP_ID and seen["category"] == "system"
    rows = {
        (one["topic"], one["name"]): (one["kind"], one["calls_24h"], one["errors_24h"]) for one in seen["operations"]
    }
    assert rows == {
        (TOPIC, "draft_review"): ("ai", 1, 0),
        (TOPIC, "enter_order"): ("rpa", 1, 1),  # order_id가 없어 실패했다
        ("ext-credit", "check_credit"): ("api", 0, 0),
    }
    used = admin.get("/admin/v1/usage", headers={"Authorization": "Bearer t-consumer"}).json()
    assert {one["topic"] for one in used["items"]} == {TOPIC} and used["total"] == 2
    assert all("input" not in one and "output" not in one for one in used["items"]), "업무 값은 없다"


def test_without_an_admin_token_the_admin_api_stays_shut(tmp_path: Path) -> None:
    from bpm.service_kit import InMemoryUsageLog  # noqa: PLC0415
    from bpm.unified_consumer.admin import create_admin_app  # noqa: PLC0415

    admin = TestClient(create_admin_app([], admin_token=None, log=InMemoryUsageLog()))
    assert admin.get("/admin/v1/status", headers={"Authorization": "Bearer x"}).status_code == 503
    assert admin.get("/healthz").json()["status"] == "ok"
