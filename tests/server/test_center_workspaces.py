"""C17 — Center가 작업 폴더를 들고 있는가 (ADR-0143·0146).

거듭 보는 것.

1. **파일이 원본이다** — 설계 값은 `process.json`에 있고 모르는 칸을 버리지 않는다.
2. **경로를 믿지 않는다** — `..`·`libs/`·엉뚱한 확장자는 422 `bad_path`다.
3. **덮어쓰기를 막는다** — `If-Match`가 없거나 낡으면 **아무것도 쓰지 않는다**.
4. **묶음은 실행기 키만** 집어 간다 — 승인 봉투도 서명도 없는 그림이라서다.
5. 회사가 정해진 계정은 제 회사 것만 — 남의 것은 같은 404다.
"""

from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import quote

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


def new_workspace(client: TestClient, workspace_id: str = "finance.invoice", **extra: Any) -> Any:
    body = {"id": workspace_id, "name": "청구서 발행", **extra}
    return made(client.post(f"{API}/workspaces", json=body, headers=ADMIN))


def put(client: TestClient, workspace_id: str, path: str, text: str, **headers: str) -> Any:
    return client.put(
        f"{API}/workspaces/{workspace_id}/files/{path}",
        content=text.encode("utf-8"),
        headers={**ADMIN, **headers},
    )


def runner_key(client: TestClient) -> dict[str, str]:
    answer = client.post(f"{API}/center-keys", json={"name": "srv-1", "type": "server_runner"}, headers=ADMIN)
    assert answer.status_code == 201, answer.text
    return {"Authorization": f"Bearer {answer.json()['key']}"}


# ─────────────────────────── 작업공간 ───────────────────────────


def test_a_new_workspace_is_an_empty_work_folder(client: TestClient, workspace_dir: Path) -> None:
    """빈 한 벌 — `process/`·`cases/`와 기록. **이것이 없으면 편집기가 고칠 파일이 없다.**"""
    info = new_workspace(client)
    assert info["id"] == "finance.invoice"
    assert info["company"] == "default"
    assert "entry" not in info, "아직 고르지 않았다 — 빈 칸은 싣지 않는다"
    assert (workspace_dir / "finance.invoice" / "process").is_dir()
    assert (workspace_dir / "finance.invoice" / "cases").is_dir()
    record = json.loads((workspace_dir / "finance.invoice" / "process.json").read_text(encoding="utf-8"))
    assert record["name"] == "청구서 발행"
    assert record["schema"] == 1, "실행기의 `core.testrun.workspace`가 읽는 판이다"


def test_the_same_id_twice_is_refused(client: TestClient) -> None:
    new_workspace(client)
    answer = client.post(
        f"{API}/workspaces", json={"id": "finance.invoice", "name": "또"}, headers=ADMIN
    )
    assert answer.status_code == 409
    assert answer.json()["code"] == "exists"


def test_a_company_that_is_not_there_is_refused(client: TestClient) -> None:
    """**없는 회사로 만들지 않는다** — 짓는 데까지 가서야 패키지 등록이 막히고, 그 자리에서는
    고칠 길이 없다 (회사는 만들 때 정해지고 바뀌지 않는다, C16).
    """
    answer = client.post(
        f"{API}/workspaces", json={"id": "x.y", "name": "x", "company": "nope"}, headers=ADMIN
    )
    assert answer.status_code == 422
    assert answer.json()["code"] == "company_unknown"


def test_an_id_that_could_not_be_a_package_is_refused(client: TestClient) -> None:
    """id는 **그대로 C1 매니페스트 id**가 된다 — 여기서 느슨하면 짓다가 R1로 막힌다."""
    answer = client.post(f"{API}/workspaces", json={"id": "Finance Invoice", "name": "청구"}, headers=ADMIN)
    assert answer.status_code == 422


def test_reading_takes_the_read_token_and_writing_does_not(client: TestClient) -> None:
    new_workspace(client)
    assert client.get(f"{API}/workspaces", headers=READ).status_code == 200
    assert client.post(f"{API}/workspaces", json={"id": "x", "name": "x"}, headers=READ).status_code == 403


def test_updating_keeps_the_fields_the_manifest_has_no_room_for(
    client: TestClient, workspace_dir: Path
) -> None:
    """담당자·태그는 매니페스트에 칸이 없다 — **기록에는 남아야 한다** (C17 §모델)."""
    new_workspace(client)
    record = workspace_dir / "finance.invoice" / "process.json"
    kept = json.loads(record.read_text(encoding="utf-8"))
    kept["owner"] = "김청구"
    kept["tags"] = ["재무"]
    put(client, "finance.invoice", "process.json", json.dumps(kept, ensure_ascii=False),
        **{"If-Match": _revision(client, "finance.invoice", "process.json")})

    info = made(client.patch(f"{API}/workspaces/finance.invoice", json={"version": "1.2.0"}, headers=ADMIN), 200)
    assert info["version"] == "1.2.0"
    after = json.loads(record.read_text(encoding="utf-8"))
    assert after["owner"] == "김청구"
    assert after["tags"] == ["재무"]


def test_an_entry_that_is_not_there_is_refused(client: TestClient) -> None:
    """돌릴 때야 드러나면 사람이 **엉뚱한 데를 고친다**."""
    new_workspace(client)
    answer = client.patch(
        f"{API}/workspaces/finance.invoice", json={"entry": "process/없다.bpmn"}, headers=ADMIN
    )
    assert answer.status_code == 422
    assert answer.json()["code"] == "no_entry"


def test_deleting_a_workspace_leaves_the_folder_behind_no_more(
    client: TestClient, workspace_dir: Path
) -> None:
    new_workspace(client)
    assert client.delete(f"{API}/workspaces/finance.invoice", headers=ADMIN).status_code == 204
    assert not (workspace_dir / "finance.invoice").exists()
    assert client.get(f"{API}/workspaces/finance.invoice", headers=ADMIN).status_code == 404


# ─────────────────────────── 파일 ───────────────────────────


def _revision(client: TestClient, workspace_id: str, path: str) -> str:
    answer = client.get(f"{API}/workspaces/{workspace_id}/files/{path}", headers=ADMIN)
    assert answer.status_code == 200, answer.text
    return str(answer.headers["etag"])


def test_a_definition_goes_in_and_comes_back_byte_for_byte(client: TestClient) -> None:
    """**Center는 BPMN을 해석하지 않는다** — 글자 그대로 담고 돌려준다."""
    new_workspace(client)
    info = made(put(client, "finance.invoice", "process/main.bpmn", XML))
    assert info["revision"].startswith("sha256:")
    answer = client.get(f"{API}/workspaces/finance.invoice/files/process/main.bpmn", headers=ADMIN)
    assert answer.text == XML
    assert answer.headers["etag"] == info["revision"]


def test_a_half_drawn_drawing_still_saves(client: TestClient) -> None:
    """**검사는 쓰기를 막지 않는다** — 반쯤 그린 그림을 저장하지 못하면 설계가 되지 않는다."""
    new_workspace(client)
    assert put(client, "finance.invoice", "process/main.bpmn", "<definitions").status_code == 201


def test_changing_a_file_needs_the_revision_in_hand(client: TestClient) -> None:
    """없이 쓰면 **남의 편집을 조용히 덮는다.**"""
    new_workspace(client)
    put(client, "finance.invoice", "process/main.bpmn", XML)
    answer = put(client, "finance.invoice", "process/main.bpmn", XML + "<!-- 또 -->")
    assert answer.status_code == 428
    assert answer.json()["code"] == "if_match_required"


def test_a_stale_revision_writes_nothing(client: TestClient) -> None:
    """두 사람이 같은 파일을 열면 나중 사람이 409다 — **합치지 않는다** (합치면 XML이 깨진다)."""
    new_workspace(client)
    first = made(put(client, "finance.invoice", "process/main.bpmn", XML))
    made(put(client, "finance.invoice", "process/main.bpmn", XML + "<!-- 하나 -->",
             **{"If-Match": first["revision"]}), 200)
    answer = put(client, "finance.invoice", "process/main.bpmn", XML + "<!-- 둘 -->",
                 **{"If-Match": first["revision"]})
    assert answer.status_code == 409
    assert answer.json()["code"] == "stale"
    kept = client.get(f"{API}/workspaces/finance.invoice/files/process/main.bpmn", headers=ADMIN)
    assert kept.text == XML + "<!-- 하나 -->", "아무것도 쓰지 않았다"


@pytest.mark.parametrize(
    "path",
    [
        "libs/erp.shared@1.0.0/process/main.bpmn",
        "process/main.txt",
        "runs/run_1.jsonl",
    ],
)
def test_the_paths_a_receiver_refuses(client: TestClient, path: str) -> None:
    new_workspace(client)
    answer = put(client, "finance.invoice", path, XML)
    assert answer.status_code == 422, answer.text
    assert answer.json()["code"] == "bad_path"


def test_a_path_that_climbs_out_never_reaches_the_disk(
    client: TestClient, store: Store, workspace_dir: Path
) -> None:
    """HTTP 쪽은 주소를 고르기도 하니 **판단하는 자리를 바로 부른다** (`..`는 계약이 막는다)."""
    from bpm.center import workspaces
    from bpm.center.errors import ApiError

    new_workspace(client)
    with pytest.raises(ApiError) as caught:
        workspaces.write_file(
            store,
            workspace_dir=workspace_dir,
            workspace_id="finance.invoice",
            path="process/../../escape.bpmn",
            data=b"x",
            if_match=None,
            actor="시험",
            company=None,
        )
    assert caught.value.code == "bad_path"
    assert not (workspace_dir.parent / "escape.bpmn").exists()


def test_the_entry_cannot_be_deleted(client: TestClient) -> None:
    new_workspace(client)
    put(client, "finance.invoice", "process/main.bpmn", XML)
    made(client.patch(f"{API}/workspaces/finance.invoice", json={"entry": "process/main.bpmn"},
                      headers=ADMIN), 200)
    answer = client.delete(f"{API}/workspaces/finance.invoice/files/process/main.bpmn", headers=ADMIN)
    assert answer.status_code == 409
    assert answer.json()["code"] == "entry_in_use"


def test_the_file_list_says_who_touched_it(client: TestClient) -> None:
    """`updated_by`를 **파일 시스템이 모른다** — 그래서 DB가 말해 준다."""
    new_workspace(client)
    put(client, "finance.invoice", "process/main.bpmn", XML)
    listed = made(client.get(f"{API}/workspaces/finance.invoice/files", headers=ADMIN), 200)
    paths = {one["path"]: one for one in listed}
    assert set(paths) == {"process.json", "process/main.bpmn"}
    assert paths["process/main.bpmn"]["updated_by"]
    assert paths["process/main.bpmn"]["size_bytes"] == len(XML.encode("utf-8"))


# ─────────────────────────── 묶음 ───────────────────────────


def test_the_revision_changes_when_any_file_does(client: TestClient) -> None:
    """검사 캐시의 열쇠다 (ADR-0146) — 안 바뀌면 낡은 결과를 준다."""
    before = new_workspace(client)["revision"]
    put(client, "finance.invoice", "process/main.bpmn", XML)
    after = made(client.get(f"{API}/workspaces/finance.invoice", headers=ADMIN), 200)["revision"]
    assert before != after


def test_the_bundle_carries_the_cases_too(client: TestClient) -> None:
    """**케이스도 담는다** — 배포 패키지와 다른 점이다 (C1)."""
    new_workspace(client)
    put(client, "finance.invoice", "process/main.bpmn", XML)
    put(client, "finance.invoice", "cases/main.cases.json", '{"schema": 1, "cases": []}')
    answer = client.get(f"{API}/workspaces/finance.invoice/bundle", headers=runner_key(client))
    assert answer.status_code == 200, answer.text
    with zipfile.ZipFile(io.BytesIO(answer.content)) as found:
        assert set(found.namelist()) == {"process.json", "process/main.bpmn", "cases/main.cases.json"}
    assert answer.headers["x-bpm-revision"].startswith("sha256:")


def test_only_the_runner_may_take_the_bundle(client: TestClient) -> None:
    """승인 봉투도 서명도 없는 그림이라 **길을 좁혀 둔다** (ADR-0146)."""
    new_workspace(client)
    for headers in (ADMIN, READ):
        answer = client.get(f"{API}/workspaces/finance.invoice/bundle", headers=headers)
        assert answer.status_code == 403, answer.text
        assert answer.json()["code"] == "wrong_key_type"


# ─────────────────────────── 가져오기 ───────────────────────────


def test_a_single_drawing_lands_in_process(client: TestClient) -> None:
    """밖에서 그린 그림이 들어오는 자리 (ADR-0143 §2)."""
    new_workspace(client)
    made(client.post(f"{API}/workspaces/finance.invoice/import", content=XML.encode("utf-8"),
                     headers={**ADMIN, "X-BPM-File-Name": "main.bpmn"}))
    assert client.get(
        f"{API}/workspaces/finance.invoice/files/process/main.bpmn", headers=ADMIN
    ).status_code == 200


def test_a_korean_file_name_comes_percent_encoded(client: TestClient) -> None:
    """헤더는 ASCII다 (CLAUDE.md §5) — 보내는 쪽이 퍼센트 인코딩하고 **받는 쪽이 푼다**.

    풀지 않으면 `주문.bpmn`이 `%EC%A3%BC%EB%AC%B8.bpmn`이라는 이름으로 담긴다.
    """
    new_workspace(client)
    made(client.post(f"{API}/workspaces/finance.invoice/import", content=XML.encode("utf-8"),
                     headers={**ADMIN, "X-BPM-File-Name": quote("주문.bpmn")}))
    listed = made(client.get(f"{API}/workspaces/finance.invoice/files", headers=ADMIN), 200)
    assert "process/주문.bpmn" in {one["path"] for one in listed}


def test_an_old_work_folder_zip_loses_its_wrapper(client: TestClient) -> None:
    """옛 작업 폴더는 `<id>/` 한 겹이 더 있다 — `process.json`이 있는 자리를 뿌리로 본다."""
    new_workspace(client)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as made_zip:
        made_zip.writestr("finance.invoice/process.json", '{"schema": 1, "id": "finance.invoice"}')
        made_zip.writestr("finance.invoice/process/main.bpmn", XML)
        made_zip.writestr("finance.invoice/cases/main.cases.json", "{}")
    listed = made(client.post(f"{API}/workspaces/finance.invoice/import", content=out.getvalue(),
                              headers={**ADMIN, "X-BPM-File-Name": "folder.zip"}))
    assert {one["path"] for one in listed} == {"process.json", "process/main.bpmn", "cases/main.cases.json"}


def test_a_zip_with_a_path_we_refuse_imports_nothing(client: TestClient) -> None:
    """**조용히 버리지 않는다** — 「넣었는데 없다」가 가장 나쁘다."""
    new_workspace(client)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as made_zip:
        made_zip.writestr("process/main.bpmn", XML)
        made_zip.writestr("secrets/token.txt", "x")
    answer = client.post(f"{API}/workspaces/finance.invoice/import", content=out.getvalue(),
                         headers={**ADMIN, "X-BPM-File-Name": "folder.zip"})
    assert answer.status_code == 422
    assert answer.json()["code"] == "bad_path"
    listed = made(client.get(f"{API}/workspaces/finance.invoice/files", headers=ADMIN), 200)
    assert {one["path"] for one in listed} == {"process.json"}


# ─────────────────────────── 회사 ───────────────────────────


def test_another_companys_workspace_is_a_404(client: TestClient, store: Store) -> None:
    """있다는 것조차 알리지 않는다 (C16과 같은 결)."""
    made(client.post(f"{API}/companies", json={"id": "company2", "name": "회사2"}, headers=ADMIN))
    new_workspace(client, "finance.invoice", company="company2")
    accounts.create(store, username="kim", password="company-admin-2026", role="company_admin",
                    by="시험", company="default")
    session = made(client.post(f"{API}/auth/login", json={"username": "kim", "password": "company-admin-2026"}), 200)
    mine = {"Authorization": f"Bearer {session['token']}"}
    assert client.get(f"{API}/workspaces/finance.invoice", headers=mine).status_code == 404
    assert made(client.get(f"{API}/workspaces", headers=mine), 200) == []
