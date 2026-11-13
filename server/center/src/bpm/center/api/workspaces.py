"""작업공간의 경로 (C17, [ADR-0143](../../../../../../docs/decisions/0143-design-happens-in-the-console.md)).

| 경로 | 인증 |
| --- | --- |
| `GET /workspaces…` | 읽기 (회사가 정해진 쪽은 제 회사만) |
| `POST/PATCH/DELETE /workspaces…`, 파일 쓰기·가져오기 | 관리자 |
| `GET /workspaces/{id}/bundle` | **서버 실행기 키** (돌리고 검사하고 짓는 쪽이 집어 간다) |

판단은 `center.workspaces`에 있고 여기는 길만 잇는다.

**Studio 키 종류는 받지 않는다** (ADR-0143 §4) — 설계자의 키가 없어졌다. 콘솔 로그인 하나가 그
일을 하고, 그래서 로그인의 무게가 늘었다 (`docs/09-gaps.md` §3-33).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from bpm.center import design_work, trials, workspaces
from bpm.center.api import server_runner
from bpm.center.api.body import read_json as _json
from bpm.center.auth import (
    Caller,
    company_scope,
    require_admin,
    require_key_type,
    require_read,
)
from bpm.center.responses import Utf8JSONResponse
from bpm.center.settings import Settings
from bpm.center.storage import Store

router = APIRouter(prefix="/api/v1", tags=["workspaces"])

#: 실행기가 묶음을 집어 갈 때 쓰는 키 종류 (C7) — 그 계약의 자리를 그대로 쓴다.
RUNNER_KEY_TYPE = server_runner.KEY_TYPE


def _store(request: Request) -> Store:
    store: Store = request.app.state.store
    return store


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _reader(request: Request) -> Caller:
    return require_read(request.app.state.authenticate(request))


def _writer(request: Request) -> Caller:
    return require_admin(request.app.state.authenticate(request))


def _dir(request: Request) -> Any:
    return _settings(request).workspace_dir


# ─────────────────────────── 작업공간 ───────────────────────────


@router.get("/workspaces")
def list_workspaces(request: Request, q: str | None = None) -> Any:
    found = _reader(request)
    listed = workspaces.listing(
        _store(request), workspace_dir=_dir(request), company=company_scope(found), q=q
    )
    return [one.to_json_dict() for one in listed]


@router.post("/workspaces")
async def create_workspace(request: Request) -> Any:
    found = _writer(request)
    info = workspaces.create(
        _store(request),
        workspace_dir=_dir(request),
        body=await _json(request),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=201, content=info.to_json_dict())


@router.get("/workspaces/{workspace_id}")
def get_workspace(request: Request, workspace_id: str) -> Any:
    found = _reader(request)
    return workspaces.get(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    ).to_json_dict()


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(request: Request, workspace_id: str) -> Any:
    found = _writer(request)
    return workspaces.update(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        body=await _json(request),
        actor=found.actor,
        company=company_scope(found),
    ).to_json_dict()


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(request: Request, workspace_id: str) -> Response:
    found = _writer(request)
    workspaces.delete(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    )
    return Response(status_code=204)


# ─────────────────────────── 파일 ───────────────────────────


@router.get("/workspaces/{workspace_id}/files")
def list_files(request: Request, workspace_id: str) -> Any:
    found = _reader(request)
    workspaces.get(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    )
    return [one.to_json_dict() for one in workspaces.files(_store(request), workspace_id)]


@router.get("/workspaces/{workspace_id}/files/{path:path}")
def read_file(request: Request, workspace_id: str, path: str) -> Response:
    """본문 그대로. **`ETag`가 `revision`이다** — 고칠 때 그것을 `If-Match`에 싣는다."""
    found = _reader(request)
    data, revision = workspaces.read_file(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        path=path,
        company=company_scope(found),
    )
    return Response(
        content=data,
        media_type=_media_type(path),
        headers={"ETag": revision, "Cache-Control": "no-store"},
    )


@router.put("/workspaces/{workspace_id}/files/{path:path}")
async def write_file(request: Request, workspace_id: str, path: str) -> Any:
    """**Center는 BPMN을 해석하지 않는다** — 글자 그대로 담는다 (검사는 돌리기 전에 본다)."""
    found = _writer(request)
    info, created = workspaces.write_file(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        path=path,
        data=await request.body(),
        if_match=request.headers.get("if-match"),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(
        status_code=201 if created else 200,
        content=info.to_json_dict(),
        headers={"ETag": info.revision},
    )


@router.delete("/workspaces/{workspace_id}/files/{path:path}", status_code=204)
def delete_file(request: Request, workspace_id: str, path: str) -> Response:
    found = _writer(request)
    workspaces.delete_file(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        path=path,
        actor=found.actor,
        company=company_scope(found),
    )
    return Response(status_code=204)


@router.post("/workspaces/{workspace_id}/import")
async def import_files(request: Request, workspace_id: str) -> Any:
    """`.bpmn` 하나 또는 **옛 작업 폴더 zip** — 밖에서 그린 그림이 들어오는 자리 (ADR-0143 §2).

    이름은 `X-BPM-File-Name` 헤더로 받는다 (ASCII만 — CLAUDE.md §5). 없으면 zip으로 본다.
    """
    found = _writer(request)
    made = workspaces.import_into(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        raw=await request.body(),
        file_name=request.headers.get("x-bpm-file-name", "bundle.zip"),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=201, content=[one.to_json_dict() for one in made])


# ─────────────────────────── 시험 실행 ───────────────────────────


@router.post("/workspaces/{workspace_id}/test-runs")
async def create_test_run(request: Request, workspace_id: str) -> Any:
    """돌려 본다 — **내려보내는 것은 하트비트**이고 여기서는 줄에 세운다 (ADR-0007·0146)."""
    found = _writer(request)
    info = trials.create(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        body=await _json(request),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=201, content=info.to_json_dict())


@router.get("/workspaces/{workspace_id}/test-runs")
def list_test_runs(request: Request, workspace_id: str) -> Any:
    found = _reader(request)
    listed = trials.listing(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    )
    return [one.to_json_dict() for one in listed]


@router.get("/workspaces/{workspace_id}/test-runs/{run_id}")
def get_test_run(request: Request, workspace_id: str, run_id: str) -> Any:
    found = _reader(request)
    return trials.get(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        run_id=run_id,
        company=company_scope(found),
    ).to_json_dict()


@router.delete("/workspaces/{workspace_id}/test-runs/{run_id}")
def stop_test_run(request: Request, workspace_id: str, run_id: str) -> Any:
    """「중지」 — **판정하지 않는다**. 내려간 것은 작업 취소로 실행기가 닫는다 (ADR-0063)."""
    found = _writer(request)
    return trials.stop(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        run_id=run_id,
        company=company_scope(found),
    ).to_json_dict()


@router.put("/workspaces/{workspace_id}/test-runs/{run_id}")
async def report_test_run(request: Request, workspace_id: str, run_id: str) -> Any:
    """실행기가 올리는 진행·끝 — **하트비트에 싣지 않는다** (로그가 수백 줄이다, ADR-0146)."""
    key = require_key_type(request.app.state.authenticate(request), RUNNER_KEY_TYPE)
    return trials.report(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        run_id=run_id,
        body=await _json(request),
        actor=key.name,
    ).to_json_dict()


# ─────────────────────────── 실행 전 검사 ───────────────────────────


@router.post("/workspaces/{workspace_id}/check")
def ask_check(request: Request, workspace_id: str, again: bool = False) -> Any:
    """C14 B1~B17 + 사전 점검을 청한다 — **검사도 실행기가 한다** (ADR-0146).

    같은 묶음의 결과가 있으면 **그대로 준다**(200 `cached`). 없으면 지시를 세우고 **202**다 —
    지시는 하트비트로 내려가므로 주기만큼 늦는다. 콘솔은 `GET`으로 다시 묻는다.
    """
    found = _writer(request)
    answer, done = design_work.check(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        actor=found.actor,
        company=company_scope(found),
        again=again,
    )
    return Utf8JSONResponse(status_code=200 if done else 202, content=answer.to_json_dict())


@router.get("/workspaces/{workspace_id}/check")
def read_check(request: Request, workspace_id: str) -> Any:
    """지금 묶음의 검사 결과. **낡은 것은 주지 않는다** — 파일이 바뀌면 다른 그림의 결과다."""
    found = _reader(request)
    answer, done = design_work.latest_check(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=200 if done else 202, content=answer.to_json_dict())


# ─────────────────────────── 배포 후보로 만들기 ───────────────────────────


@router.post("/workspaces/{workspace_id}/package")
async def ask_build(request: Request, workspace_id: str) -> Any:
    """「배포 후보로 만들기」 — **짓는 것도 실행기다**. 202로 받고 짓기 기록을 돌려준다."""
    found = _writer(request)
    info = design_work.start_build(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        body=await _json(request),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=202, content=info.to_json_dict())


@router.get("/workspaces/{workspace_id}/builds")
def list_builds(request: Request, workspace_id: str) -> Any:
    found = _reader(request)
    listed = design_work.builds(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        company=company_scope(found),
    )
    return [one.to_json_dict() for one in listed]


@router.get("/workspaces/{workspace_id}/builds/{build_id}")
def get_build(request: Request, workspace_id: str, build_id: str) -> Any:
    found = _reader(request)
    return design_work.build(
        _store(request),
        workspace_dir=_dir(request),
        workspace_id=workspace_id,
        build_id=build_id,
        company=company_scope(found),
    ).to_json_dict()


@router.post("/workspaces/{workspace_id}/builds/{build_id}/artifact")
async def take_artifact(request: Request, workspace_id: str, build_id: str) -> Any:
    """실행기가 다 지은 zip을 올린다 — **Center가 제 이름으로 등록한다** (ADR-0146).

    받는 검사는 **C5 `POST /packages`와 같은 함수**다(zip 안전·C1 R1~R6·R9·해시 재계산). 그래서
    **C5 권한표가 바뀌지 않는다** — 실행기 키에 패키지 올리기 권한을 주지 않는다.
    """
    require_key_type(request.app.state.authenticate(request), RUNNER_KEY_TYPE)
    info = design_work.took_artifact(
        _store(request),
        package_dir=_settings(request).package_dir,
        workspace_id=workspace_id,
        build_id=build_id,
        raw=await request.body(),
    )
    return Utf8JSONResponse(status_code=201, content=info.to_json_dict())


# ─────────────────────────── 묶음 (실행기가 집어 간다) ───────────────────────────


@router.get("/workspaces/{workspace_id}/bundle")
def read_bundle(request: Request, workspace_id: str) -> Response:
    """작업 폴더 zip — **서버 실행기 키만**. 시험 실행·검사·짓기 셋이 같은 길을 쓴다 (ADR-0146).

    **승인 봉투도 서명도 없다** — 승인받지 않은 그림이라서다. 그래서 이 길은 **실행기 키**로
    좁혀 둔다(읽기 토큰·Studio 키로는 집을 수 없다).
    """
    require_key_type(request.app.state.authenticate(request), RUNNER_KEY_TYPE)
    data, revision = workspaces.bundle(
        _store(request), workspace_dir=_dir(request), workspace_id=workspace_id
    )
    return Response(
        content=data,
        media_type="application/zip",
        headers={"ETag": revision, "X-BPM-Revision": revision, "Cache-Control": "no-store"},
    )


def _media_type(path: str) -> str:
    """`.bpmn`·`.dmn`은 글이고 나머지(케이스·기록)는 JSON이다 (C17 §전송)."""
    if path.endswith((".bpmn", ".dmn")):
        return "text/plain; charset=utf-8"
    return "application/json; charset=utf-8"
