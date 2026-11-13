"""C17 §공유 BPM 프로세스 설치 — 받아 둔 것을 작업 폴더의 `libs/`에 푸는 길 (ADR-0048).

STU-11이 하던 일이고 설계가 콘솔로 오면서 Center가 한다 (ADR-0143).

거듭 보는 것.

1. **자리는 평평하고 이름에 패키지 id가 붙는다** — 실행기가 `libs/*.bpmn`만 글롭한다.
2. **정의와 결정표를 함께** 푼다 — 한쪽만 풀면 규칙 태스크를 쓰는 공유 프로세스가 현장에서 깨진다.
3. **아무 패키지나 풀지 않는다** — 갈래·id·판을 본다.
4. **갈아 치울 때 옛 파일을 먼저 지운다** — 남겨 두면 글롭하는 쪽이 두 판을 함께 읽는다.
5. **판은 기록이 안다** — 파일 이름에 판이 없다.
"""

from __future__ import annotations

import io
import json
import tempfile
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import accounts, create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store
from bpm.contracts.hashing import content_hash_zip

ADMIN = {"Authorization": "Bearer t-admin"}
API = "/api/v1"
AT = "2026-11-13T09:00:00+09:00"

BPMN = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="Proc_shared" isExecutable="true"><bpmn:startEvent id="S" /></bpmn:process>
</bpmn:definitions>
"""

DMN = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D1" name="d" namespace="n">
  <decision id="grade" name="등급"><decisionTable id="t" hitPolicy="UNIQUE">
    <input id="i"><inputExpression id="ie" typeRef="number"><text>점수</text></inputExpression></input>
    <output id="o" name="등급" typeRef="string" />
    <rule id="r1"><inputEntry id="ie1"><text>&gt;= 600</text></inputEntry>
      <outputEntry id="oe1"><text>"정상"</text></outputEntry></rule>
  </decisionTable></decision>
</definitions>
"""


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
    accounts.reset_failures()
    settings = Settings(
        admin_token="t-admin",
        read_token="t-read",
        package_dir=tmp_path / "packages",
        workspace_dir=workspace_dir,
    )
    with TestClient(create_app(settings, store=store)) as found:
        yield found


def lib_zip(
    *,
    package_id: str = "erp.shared",
    version: str = "1.2.0",
    kind: str = "process_lib",
    files: dict[str, str] | None = None,
) -> bytes:
    manifest: dict[str, Any] = {
        "schema": 1,
        "kind": kind,
        "id": package_id,
        "version": version,
        "name": package_id,
        "requires": {},
        "human": {},
        "built": {"by": "studio", "at": AT, "core": "0.1.0", "spec_version": 1},
        "content_hash": "sha256:" + "0" * 64,
    }
    if kind == "bpm_process":
        manifest["entry"] = "process/main.bpmn"
        manifest["process_id"] = "Proc_shared"
    inside = files if files is not None else {"process/main.bpmn": BPMN, "process/grade.dmn": DMN}

    def made(body: str) -> bytes:
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, text in inside.items():
                archive.writestr(name, text)
            archive.writestr("manifest.json", body)
        return out.getvalue()

    with tempfile.TemporaryDirectory() as folder:
        staged = Path(folder) / "p.zip"
        staged.write_bytes(made(json.dumps(manifest, ensure_ascii=False)))
        manifest["content_hash"] = content_hash_zip(staged)
    return made(json.dumps(manifest, ensure_ascii=False))


def upload(client: TestClient, raw: bytes) -> Any:
    answer = client.post(
        f"{API}/packages", files={"file": ("p.zip", raw, "application/zip")}, headers=ADMIN
    )
    assert answer.status_code in (200, 201), answer.text
    return answer.json()


def new_workspace(client: TestClient, workspace_id: str = "finance.invoice") -> Any:
    answer = client.post(f"{API}/workspaces", json={"id": workspace_id, "name": "청구서"}, headers=ADMIN)
    assert answer.status_code == 201, answer.text
    return answer.json()


def install(client: TestClient, *, package_id: str = "erp.shared", version: str = "1.2.0") -> Any:
    return client.post(
        f"{API}/workspaces/finance.invoice/libs",
        json={"schema": 1, "package_id": package_id, "version": version},
        headers=ADMIN,
    )


# ─────────────────────────── 설치 ───────────────────────────


def test_installing_unpacks_definitions_and_decisions_side_by_side(
    client: TestClient, workspace_dir: Path
) -> None:
    """**둘 다 푼다** — 한쪽만 풀면 규칙 태스크를 쓰는 공유 프로세스가 현장에서 깨진다."""
    new_workspace(client)
    upload(client, lib_zip())
    answer = install(client)
    assert answer.status_code == 201, answer.text

    folder = workspace_dir / "finance.invoice" / "libs"
    # **평평하고 이름에 패키지 id가 붙는다** — 실행기가 `libs/*.bpmn`만 글롭한다.
    assert (folder / "erp.shared__main.bpmn").is_file()
    assert (folder / "erp.shared__grade.dmn").is_file()
    assert not (folder / "process").exists()


def test_the_record_keeps_the_version_the_file_names_cannot(client: TestClient) -> None:
    """파일 이름에 판이 없다 — **기록이 안다**. 배포 후보를 지을 때 `requires.libs`로 간다 (C1)."""
    new_workspace(client)
    upload(client, lib_zip())
    info = install(client).json()
    assert info["libs"] == [
        {"id": "erp.shared", "version": "1.2.0", "processes": ["Proc_shared"]}
    ]


def test_the_unpacked_files_show_up_in_the_file_list(client: TestClient) -> None:
    """탐색기가 그려야 하고 **묶음에도 들어가야** 한다 (실행기가 그 묶음으로 돌린다)."""
    new_workspace(client)
    upload(client, lib_zip())
    install(client)
    paths = [one["path"] for one in client.get(f"{API}/workspaces/finance.invoice/files", headers=ADMIN).json()]
    assert "libs/erp.shared__main.bpmn" in paths
    assert "libs/erp.shared__grade.dmn" in paths


def test_what_was_unpacked_still_cannot_be_edited(client: TestClient) -> None:
    """**받은 것은 편집 대상이 아니다** — 설치만 넣는 길이고 파일 쓰기는 `libs/`를 거부한다."""
    new_workspace(client)
    upload(client, lib_zip())
    install(client)
    answer = client.put(
        f"{API}/workspaces/finance.invoice/files/libs/erp.shared__main.bpmn",
        content=b"<x/>",
        headers=ADMIN,
    )
    assert answer.status_code == 422
    assert answer.json()["code"] == "bad_path"


def test_installing_again_replaces_the_old_version(client: TestClient, workspace_dir: Path) -> None:
    """「갱신」 — **옛 판의 파일을 먼저 지운다**. 남겨 두면 글롭하는 쪽이 두 판을 함께 읽는다."""
    new_workspace(client)
    upload(client, lib_zip())
    upload(client, lib_zip(version="1.3.0", files={"process/other.bpmn": BPMN}))
    install(client)
    answer = install(client, version="1.3.0")
    assert answer.status_code == 201, answer.text

    folder = workspace_dir / "finance.invoice" / "libs"
    assert (folder / "erp.shared__other.bpmn").is_file()
    assert not (folder / "erp.shared__main.bpmn").exists(), "옛 판이 남으면 두 판을 함께 읽는다"
    assert [one["version"] for one in answer.json()["libs"]] == ["1.3.0"]


# ─────────────────────────── 받지 않는 것 ───────────────────────────


def test_a_bpm_process_package_is_not_a_shared_process(client: TestClient) -> None:
    """`bpm_process`를 lib으로 풀면 **진입 정의가 남의 `libs/`에서 돌게 된다**."""
    new_workspace(client)
    upload(client, lib_zip(kind="bpm_process"))
    answer = install(client)
    assert answer.status_code == 422
    assert answer.json()["code"] == "wrong_kind"


def test_a_package_without_definitions_is_refused(client: TestClient) -> None:
    """풀 것이 없는 패키지 — 빈 `libs/<id>`를 남기지 않는다."""
    new_workspace(client)
    upload(client, lib_zip(files={"memory/specs.json": "{}"}))
    answer = install(client)
    assert answer.status_code == 422
    assert answer.json()["code"] == "no_definitions"


def test_a_package_that_is_not_there_is_404(client: TestClient) -> None:
    new_workspace(client)
    answer = install(client, package_id="nope")
    assert answer.status_code == 404


def test_a_revoked_package_is_not_unpacked(client: TestClient) -> None:
    """철회는 **보안 동작**이다 — 푼 뒤에는 거둘 길이 없다 (C2)."""
    new_workspace(client)
    upload(client, lib_zip())
    done = client.post(
        f"{API}/packages/erp.shared/1.2.0/revoke", json={"reason": "시험"}, headers=ADMIN
    )
    assert done.status_code < 400, done.text
    answer = install(client)
    assert answer.status_code == 410


# ─────────────────────────── 제거 ───────────────────────────


def test_removing_takes_only_what_that_package_put_there(
    client: TestClient, workspace_dir: Path
) -> None:
    """**기록이 적어 둔 파일만** — `libs/`를 비우면 다른 판까지 날아간다."""
    new_workspace(client)
    upload(client, lib_zip())
    upload(client, lib_zip(package_id="hr.common", version="0.3.0", files={"process/leave.bpmn": BPMN}))
    install(client)
    install(client, package_id="hr.common", version="0.3.0")

    answer = client.delete(f"{API}/workspaces/finance.invoice/libs/erp.shared", headers=ADMIN)
    assert answer.status_code == 200, answer.text
    assert [one["id"] for one in answer.json()["libs"]] == ["hr.common"]

    folder = workspace_dir / "finance.invoice" / "libs"
    assert not (folder / "erp.shared__main.bpmn").exists()
    assert (folder / "hr.common__leave.bpmn").is_file()


def test_removing_what_was_never_installed_is_404(client: TestClient) -> None:
    new_workspace(client)
    answer = client.delete(f"{API}/workspaces/finance.invoice/libs/nope", headers=ADMIN)
    assert answer.status_code == 404
