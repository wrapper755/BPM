"""프로젝트의 경로 (C17, [ADR-0175](../../../../../../docs/decisions/0175-projects-hold-processes.md)).

| 경로 | 인증 |
| --- | --- |
| `GET /projects…` | 읽기 (회사가 정해진 쪽은 제 회사만) |
| `POST/PATCH/DELETE /projects…`, 가져오기 | 관리자 |

판단은 `center.projects`에 있고 여기는 길만 잇는다. 작업공간의 길과 같은 결이다 (`api/workspaces.py`).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from bpm.center import projects
from bpm.center.api.body import read_json as _json
from bpm.center.api.workspaces import _dir, _reader, _store, _writer
from bpm.center.auth import company_scope
from bpm.center.responses import Utf8JSONResponse

router = APIRouter(prefix="/api/v1", tags=["projects"])


@router.get("/projects")
def list_projects(request: Request, q: str | None = None) -> Any:
    found = _reader(request)
    return [one.to_json_dict() for one in projects.listing(_store(request), company=company_scope(found), q=q)]


@router.post("/projects")
async def create_project(request: Request) -> Any:
    found = _writer(request)
    info = projects.create(
        _store(request), body=await _json(request), actor=found.actor, company=company_scope(found)
    )
    return Utf8JSONResponse(status_code=201, content=info.to_json_dict())


@router.get("/projects/{project_id}")
def get_project(request: Request, project_id: str) -> Any:
    found = _reader(request)
    return projects.get(_store(request), project_id=project_id, company=company_scope(found)).to_json_dict()


@router.patch("/projects/{project_id}")
async def update_project(request: Request, project_id: str) -> Any:
    found = _writer(request)
    return projects.update(
        _store(request),
        project_id=project_id,
        body=await _json(request),
        actor=found.actor,
        company=company_scope(found),
    ).to_json_dict()


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(request: Request, project_id: str) -> Response:
    found = _writer(request)
    projects.delete(_store(request), project_id=project_id, company=company_scope(found))
    return Response(status_code=204)


@router.get("/projects/{project_id}/workspaces")
def list_project_workspaces(request: Request, project_id: str) -> Any:
    found = _reader(request)
    listed = projects.workspaces_of(
        _store(request), workspace_dir=_dir(request), project_id=project_id, company=company_scope(found)
    )
    return [one.to_json_dict() for one in listed]


@router.post("/projects/{project_id}/import")
async def import_project(request: Request, project_id: str) -> Any:
    """옛 작업 폴더 zip — **작업 폴더 여럿을 담았으면 프로세스 여럿**이다 (ADR-0175 §5)."""
    found = _writer(request)
    result = projects.import_zip(
        _store(request),
        workspace_dir=_dir(request),
        project_id=project_id,
        raw=await request.body(),
        actor=found.actor,
        company=company_scope(found),
    )
    return Utf8JSONResponse(status_code=201, content=result.to_json_dict())
