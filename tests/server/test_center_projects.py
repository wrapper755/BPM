"""C17 — 프로젝트가 작업공간을 묶는가 (ADR-0175).

거듭 보는 것.

1. **회사는 프로젝트가 정한다** — 안의 작업공간이 물려받고, 다른 회사 프로젝트로는 옮기지 않는다.
2. **프로젝트를 모르는 쪽도 그대로 돈다** — 고르지 않으면 회사의 기본 프로젝트(id = 회사 id)다.
3. **가져오기는 전부 아니면 하나도 아니다** — 작업 폴더 여럿을 담은 zip에서 하나라도 걸리면 아무것도 없다.
4. **`libs/` 사본은 버리고 설치할 것으로 돌려준다** — 받아 둔 공유 BPM 프로세스는 설치로만 들어온다.
5. 비지 않은 프로젝트는 지우지 않는다. 남의 회사 것은 404다.
"""

from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from bpm.center import accounts, create_app
from bpm.center.settings import Settings
from bpm.center.storage import Store

ADMIN = {"Authorization": "Bearer t-admin"}
READ = {"Authorization": "Bearer t-read"}
API = "/api/v1"
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
    accounts.reset_failures()
    settings = Settings(
        admin_token="t-admin",
        read_token="t-read",
        package_dir=tmp_path / "packages",
        workspace_dir=workspace_dir,
    )
    with TestClient(create_app(settings, store=store)) as found:
        yield found


def made(answer: Any, code: int = 201) -> Any:
    assert answer.status_code == code, answer.text
    return answer.json()


def new_project(client: TestClient, project_id: str = "company1", **extra: Any) -> Any:
    body = {"id": project_id, "name": "Company1 시연", **extra}
    return made(client.post(f"{API}/projects", json=body, headers=ADMIN))


def work_folders(*folders: tuple[str, dict[str, Any]], libs_copy: bool = False) -> bytes:
    """Company1 `bpm/company1/`처럼 **작업 폴더 여럿**을 한 zip에."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as made_zip:
        for prefix, record in folders:
            made_zip.writestr(f"{prefix}/process.json", json.dumps(record, ensure_ascii=False))
            made_zip.writestr(f"{prefix}/process/{record['entry']}", XML)
            if libs_copy:
                made_zip.writestr(f"{prefix}/libs/platform.case-plan__case-plan.bpmn", XML)
    return out.getvalue()


def record(process_id: str, **extra: Any) -> dict[str, Any]:
    return {"schema": 1, "id": process_id, "name": process_id.upper(), "version": "0.2.0",
            "entry": f"{process_id.split('.')[-1]}.bpmn", **extra}


# ─────────────────────────── 프로젝트 ───────────────────────────


def test_a_project_carries_the_company(client: TestClient) -> None:
    info = new_project(client, description="부품사 손익 시나리오")
    assert info["company"] == "default"
    assert info["processes"] == 0
    assert made(client.get(f"{API}/projects/company1", headers=READ), 200)["description"] == "부품사 손익 시나리오"


def test_a_workspace_takes_its_company_from_the_project(client: TestClient) -> None:
    made(client.post(f"{API}/companies", json={"id": "company2", "name": "회사2"}, headers=ADMIN))
    new_project(client, "c2.work", company="company2")
    info = made(client.post(f"{API}/workspaces", json={"id": "c2.sc01", "name": "장면 1", "project": "c2.work"},
                            headers=ADMIN))
    assert (info["project"], info["company"]) == ("c2.work", "company2")
    answer = client.post(
        f"{API}/workspaces",
        json={"id": "c2.sc02", "name": "장면 2", "project": "c2.work", "company": "default"},
        headers=ADMIN,
    )
    assert answer.status_code == 422
    assert answer.json()["code"] == "company_mismatch"


def test_without_a_project_a_workspace_lands_in_the_companys_own(client: TestClient) -> None:
    """프로젝트를 모르는 자동화가 그대로 돈다 — 34판이 옮긴 자리와 같다 (ADR-0175 §6)."""
    info = made(client.post(f"{API}/workspaces", json={"id": "finance.invoice", "name": "청구"}, headers=ADMIN))
    assert info["project"] == "default"
    project = made(client.get(f"{API}/projects/default", headers=READ), 200)
    assert (project["company"], project["processes"]) == ("default", 1)


def test_a_process_moves_only_within_its_company(client: TestClient) -> None:
    made(client.post(f"{API}/companies", json={"id": "company2", "name": "회사2"}, headers=ADMIN))
    new_project(client, "first", company="default")
    new_project(client, "second", company="default")
    new_project(client, "elsewhere", company="company2")
    made(client.post(f"{API}/workspaces", json={"id": "a.b", "name": "a", "project": "first"}, headers=ADMIN))
    moved = made(client.patch(f"{API}/workspaces/a.b", json={"project": "second"}, headers=ADMIN), 200)
    assert moved["project"] == "second"
    answer = client.patch(f"{API}/workspaces/a.b", json={"project": "elsewhere"}, headers=ADMIN)
    assert answer.status_code == 422
    assert answer.json()["code"] == "company_mismatch"
    assert [one["id"] for one in made(client.get(f"{API}/projects/second/workspaces", headers=READ), 200)] == ["a.b"]


def test_a_project_with_processes_is_not_deleted(client: TestClient) -> None:
    new_project(client)
    made(client.post(f"{API}/workspaces", json={"id": "a.b", "name": "a", "project": "company1"}, headers=ADMIN))
    answer = client.delete(f"{API}/projects/company1", headers=ADMIN)
    assert answer.status_code == 409
    assert answer.json()["code"] == "not_empty"
    assert client.delete(f"{API}/workspaces/a.b", headers=ADMIN).status_code == 204
    assert client.delete(f"{API}/projects/company1", headers=ADMIN).status_code == 204


def test_renaming_does_not_touch_the_company(client: TestClient) -> None:
    new_project(client)
    info = made(client.patch(f"{API}/projects/company1", json={"name": "새 이름", "company": "x"}, headers=ADMIN), 200)
    assert (info["name"], info["company"]) == ("새 이름", "default")


def test_another_companys_project_is_a_404(client: TestClient, store: Store) -> None:
    made(client.post(f"{API}/companies", json={"id": "company2", "name": "회사2"}, headers=ADMIN))
    new_project(client, "theirs", company="company2")
    accounts.create(store, username="kim", password="company-admin-2026", role="company_admin",
                    by="시험", company="default")
    session = made(client.post(f"{API}/auth/login", json={"username": "kim", "password": "company-admin-2026"}), 200)
    mine = {"Authorization": f"Bearer {session['token']}"}
    assert client.get(f"{API}/projects/theirs", headers=mine).status_code == 404
    assert made(client.get(f"{API}/projects", headers=mine), 200) == []
    answer = client.post(f"{API}/workspaces", json={"id": "x.y", "name": "x", "project": "theirs"}, headers=mine)
    assert answer.status_code == 404


# ─────────────────────────── 가져오기 ───────────────────────────


def test_one_zip_of_many_work_folders_makes_many_processes(client: TestClient) -> None:
    new_project(client)
    raw = work_folders(("company1/company1.sc01", record("company1.sc01")),
                       ("company1/company1.sc02", record("company1.sc02", description="장면 2")))
    result = made(client.post(f"{API}/projects/company1/import", content=raw, headers=ADMIN))
    assert sorted(one["id"] for one in result["workspaces"]) == ["company1.sc01", "company1.sc02"]
    assert {one["project"] for one in result["workspaces"]} == {"company1"}
    assert result["libs_to_install"] == []
    files = made(client.get(f"{API}/workspaces/company1.sc02/files", headers=READ), 200)
    assert sorted(one["path"] for one in files) == ["process.json", "process/sc02.bpmn"]
    info = made(client.get(f"{API}/workspaces/company1.sc02", headers=READ), 200)
    assert (info["version"], info["entry"], info["description"]) == ("0.2.0", "sc02.bpmn", "장면 2")
    assert made(client.get(f"{API}/projects/company1", headers=READ), 200)["processes"] == 2


def test_a_libs_copy_is_dropped_and_handed_back_to_install(client: TestClient) -> None:
    new_project(client)
    lib = {"id": "platform.case-plan", "version": "0.1.0", "files": ["platform.case-plan__case-plan.bpmn"]}
    raw = work_folders(("s2.sc01", record("company1.s2.sc01", libs=[lib])), libs_copy=True)
    result = made(client.post(f"{API}/projects/company1/import", content=raw, headers=ADMIN))
    assert result["libs_to_install"] == [
        {"workspace_id": "company1.s2.sc01", "package_id": "platform.case-plan", "version": "0.1.0"}
    ]
    info = made(client.get(f"{API}/workspaces/company1.s2.sc01", headers=READ), 200)
    assert info["libs"] == []  # 설치되기 전에는 받아 둔 것이 없다 — 기록이 거짓말하지 않는다
    paths = [one["path"] for one in made(client.get(f"{API}/workspaces/company1.s2.sc01/files", headers=READ), 200)]
    assert not any(path.startswith("libs/") for path in paths)


def test_one_taken_id_imports_nothing(client: TestClient) -> None:
    new_project(client)
    made(client.post(f"{API}/workspaces", json={"id": "company1.sc02", "name": "먼저"}, headers=ADMIN))
    raw = work_folders(("a", record("company1.sc01")), ("b", record("company1.sc02")))
    answer = client.post(f"{API}/projects/company1/import", content=raw, headers=ADMIN)
    assert answer.status_code == 409
    assert answer.json()["detail"]["ids"] == ["company1.sc02"]
    assert client.get(f"{API}/workspaces/company1.sc01", headers=READ).status_code == 404


def test_a_bad_id_or_path_imports_nothing(client: TestClient) -> None:
    new_project(client)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as made_zip:
        made_zip.writestr("a/process.json", json.dumps(record("company1.sc01")))
        made_zip.writestr("a/process/sc01.bpmn", XML)
        made_zip.writestr("b/process.json", json.dumps(record("Company1.SC02")))
        made_zip.writestr("c/process.json", json.dumps(record("company1.sc03")))
        made_zip.writestr("c/scripts/run.sh", "echo")
    answer = client.post(f"{API}/projects/company1/import", content=out.getvalue(), headers=ADMIN)
    assert answer.status_code == 422
    assert len(answer.json()["detail"]["paths"]) == 2
    assert client.get(f"{API}/workspaces/company1.sc01", headers=READ).status_code == 404


def test_a_zip_without_a_work_folder_says_so(client: TestClient) -> None:
    new_project(client)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as made_zip:
        made_zip.writestr("main.bpmn", XML)
    answer = client.post(f"{API}/projects/company1/import", content=out.getvalue(), headers=ADMIN)
    assert answer.status_code == 422
    assert answer.json()["code"] == "no_process"
