"""C17 결정표 — Center가 격자로 읽고 **하나만** 바꿔 쓴다 (ADR-0148).

거듭 보는 것.

1. **모르는 것은 남는다** — 같은 파일의 다른 결정, 줄의 주석, 열의 `inputValues`.
2. **엔진이 거부할 칸은 저장되지 않는다** — 칸 문법 검사는 `contracts.dmn`과 같은 함수다.
3. 덮어쓰기 막기(`If-Match`)는 파일 쓰기와 **같은 규칙**이다.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store
from bpm.contracts.dmn import read_decisions

ADMIN = {"Authorization": "Bearer t-admin"}
READ = {"Authorization": "Bearer t-read"}
API = "/api/v1"

#: 결정 둘 — 하나는 격자로 고치고, **다른 하나는 손대지 않아도 남아야 한다**.
DMN = """<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/"
                 id="Definitions_1" name="한도" namespace="urn:test">
  <dmn:decision id="Limit" name="한도 등급">
    <dmn:decisionTable id="Table_1" hitPolicy="UNIQUE">
      <dmn:input id="Input_1" label="금액">
        <dmn:inputExpression id="Expr_1" typeRef="number">
          <dmn:text>금액</dmn:text>
        </dmn:inputExpression>
        <dmn:inputValues id="Values_1"><dmn:text>[0..1000000]</dmn:text></dmn:inputValues>
      </dmn:input>
      <dmn:output id="Output_1" name="등급" typeRef="string" />
      <dmn:rule id="Rule_1">
        <dmn:inputEntry id="Cell_1"><dmn:text>&lt; 100</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="Cell_2"><dmn:text>"낮음"</dmn:text></dmn:outputEntry>
        <dmn:description>작은 건</dmn:description>
      </dmn:rule>
    </dmn:decisionTable>
  </dmn:decision>
  <dmn:decision id="Other" name="건드리지 않는 결정">
    <dmn:decisionTable id="Table_2" hitPolicy="FIRST">
      <dmn:input id="Input_9">
        <dmn:inputExpression id="Expr_9"><dmn:text>구분</dmn:text></dmn:inputExpression>
      </dmn:input>
      <dmn:output id="Output_9" name="결과" />
      <dmn:rule id="Rule_9">
        <dmn:inputEntry id="Cell_9"><dmn:text>-</dmn:text></dmn:inputEntry>
        <dmn:outputEntry id="Cell_10"><dmn:text>"그대로"</dmn:text></dmn:outputEntry>
      </dmn:rule>
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>
"""

PATH = "process/limit.dmn"


@pytest.fixture
def store() -> Iterator[Store]:
    found = Store(Path(":memory:"))
    yield found
    found.close()


@pytest.fixture
def client(store: Store, tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        admin_token="t-admin",
        read_token="t-read",
        package_dir=tmp_path / "packages",
        workspace_dir=tmp_path / "workspaces",
    )
    with TestClient(create_app(settings, store=store)) as found:
        yield found


@pytest.fixture
def ready(client: TestClient) -> TestClient:
    answer = client.post(f"{API}/workspaces", json={"id": "finance.limit", "name": "한도"}, headers=ADMIN)
    assert answer.status_code == 201, answer.text
    answer = client.put(
        f"{API}/workspaces/finance.limit/files/{PATH}", content=DMN.encode("utf-8"), headers=ADMIN
    )
    assert answer.status_code == 201, answer.text
    return client


def tables(client: TestClient) -> Any:
    answer = client.get(f"{API}/workspaces/finance.limit/decisions/{PATH}", headers=READ)
    assert answer.status_code == 200, answer.text
    return answer.json()


def xml_of(client: TestClient) -> str:
    answer = client.get(f"{API}/workspaces/finance.limit/files/{PATH}", headers=READ)
    assert answer.status_code == 200
    return str(answer.text)


def test_the_grid_comes_as_cell_text(ready: TestClient) -> None:
    """격자는 **칸의 원문**이다 — 판정용 모델은 칸을 해석해 버린다."""
    found = tables(ready)
    assert [one["id"] for one in found["tables"]] == ["Limit", "Other"]
    limit = found["tables"][0]
    assert limit["hit"] == "UNIQUE"
    assert limit["inputs"] == [{"id": "Input_1", "expression": "금액", "label": "금액", "type": "number"}]
    assert limit["outputs"] == [{"id": "Output_1", "name": "등급", "type": "string"}]
    assert limit["rules"][0]["cells"] == ["< 100"]
    assert limit["rules"][0]["values"] == ['"낮음"']
    assert limit["rules"][0]["description"] == "작은 건"
    # `ETag`는 그 파일의 revision이다 — 저장할 때 그대로 싣는다.
    assert found["revision"].startswith("sha256:")


def test_saving_one_table_leaves_everything_else(ready: TestClient) -> None:
    """**그 결정표 하나만** 바뀐다 — 다른 결정도, 열의 `inputValues`도 그대로다."""
    found = tables(ready)
    limit = found["tables"][0]
    limit["rules"].append({"id": "Rule_2", "cells": [">= 100"], "values": ['"높음"'], "description": ""})
    answer = ready.put(
        f"{API}/workspaces/finance.limit/decisions/{PATH}",
        json={"schema": 1, "table": limit},
        headers={**ADMIN, "If-Match": found["revision"]},
    )
    assert answer.status_code == 200, answer.text

    xml = xml_of(ready)
    assert "건드리지 않는 결정" in xml
    assert "inputValues" in xml  # 모르는 자식은 읽은 대로 남는다
    assert "작은 건" in xml  # 줄의 설명도
    # 엔진이 그대로 읽는가 — 마지막 관문이다.
    decided = read_decisions(xml)["Limit"].decide({"금액": 150})
    assert decided == {"등급": "높음"}


def test_a_cell_the_engine_would_refuse_is_not_saved(ready: TestClient) -> None:
    """칸 문법 검사는 **엔진과 같은 함수**다 — 통과한 칸만 파일에 들어간다."""
    found = tables(ready)
    limit = found["tables"][0]
    limit["rules"][0]["cells"] = ["금액 * 2"]  # 식은 입력 칸에 쓸 수 없다 (C14)
    answer = ready.put(
        f"{API}/workspaces/finance.limit/decisions/{PATH}",
        json={"schema": 1, "table": limit},
        headers={**ADMIN, "If-Match": found["revision"]},
    )
    assert answer.status_code == 422
    assert answer.json()["code"] == "bad_table"
    # 아무것도 쓰지 않았다 — 파일은 읽은 그대로다 (`<`는 XML에서 escape된다).
    assert "&lt; 100" in xml_of(ready)
    assert "금액 * 2" not in xml_of(ready)


def test_a_stale_revision_writes_nothing(ready: TestClient) -> None:
    """덮어쓰기 막기는 파일 쓰기와 같은 규칙이다 (C17)."""
    found = tables(ready)
    limit = found["tables"][0]
    answer = ready.put(
        f"{API}/workspaces/finance.limit/decisions/{PATH}",
        json={"schema": 1, "table": limit},
        headers={**ADMIN, "If-Match": "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
    )
    assert answer.status_code == 409
    assert answer.json()["code"] == "stale"


def test_warnings_do_not_block(ready: TestClient) -> None:
    """경고(겹친 입력 이름·빈 규칙 줄)는 막지 않고 **싣는다** — 사람이 판단한다."""
    found = tables(ready)
    limit = found["tables"][0]
    limit["rules"] = []
    answer = ready.put(
        f"{API}/workspaces/finance.limit/decisions/{PATH}",
        json={"schema": 1, "table": limit},
        headers={**ADMIN, "If-Match": found["revision"]},
    )
    assert answer.status_code == 200, answer.text
    assert any("규칙 줄이 없습니다" in one for one in answer.json()["warnings"])


def test_a_read_only_account_cannot_write(ready: TestClient) -> None:
    found = tables(ready)
    answer = ready.put(
        f"{API}/workspaces/finance.limit/decisions/{PATH}",
        json={"schema": 1, "table": found["tables"][0]},
        headers={**READ, "If-Match": found["revision"]},
    )
    assert answer.status_code == 403


def test_a_file_that_is_not_dmn_says_so(ready: TestClient) -> None:
    """읽지 못하는 파일은 **그 자리에서** 말한다 — 빈 격자를 그리지 않는다."""
    answer = ready.put(
        f"{API}/workspaces/finance.limit/files/process/broken.dmn",
        content="<이건 DMN이 아니다".encode(),
        headers=ADMIN,
    )
    assert answer.status_code == 201
    answer = ready.get(f"{API}/workspaces/finance.limit/decisions/process/broken.dmn", headers=READ)
    assert answer.status_code == 422
    assert answer.json()["code"] == "bad_table"
