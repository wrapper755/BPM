"""프로젝트 — 작업공간(BPM 프로세스)을 묶고 회사를 정한다 (C17,
[ADR-0175](../../../../../docs/decisions/0175-projects-hold-processes.md)).

**묶는 층일 뿐이다.** 짓기·판·검사·시험 실행·배포는 작업공간마다이고 C1·C5·C12는 프로젝트를 모른다.
프로젝트에는 파일이 없어 **DB가 원본**이다 (작업공간의 설계 값은 여전히 `process.json`이 원본이다).

두 가지가 규칙이다.

- **회사는 프로젝트가 정하고 바뀌지 않는다.** 작업공간 행의 `company`는 프로젝트의 것을 베낀 값이다 —
  회사로 거르는 자리(C16)가 그 칸을 본다. 옮기기는 **같은 회사 안만**이라 둘이 갈라지지 않는다.
- **가져오기는 전부 아니면 하나도 아니다** — 작업 폴더 여럿을 담은 zip에서 하나라도 못 들이면
  아무것도 만들지 않는다. 반쯤 들어온 프로젝트는 무엇이 빠졌는지 사람이 찾아야 한다.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from typing import Any

from bpm.center import workspaces
from bpm.center.errors import ApiError
from bpm.center.storage import Store, now_iso
from bpm.contracts.workspace import (
    PROCESS_JSON,
    WORKSPACE_ID_PATTERN,
    LibToInstall,
    ProjectCreateRequest,
    ProjectImportResult,
    ProjectInfo,
    ProjectUpdateRequest,
    WorkspaceInfo,
    check_file_path,
)

# ─────────────────────────── 읽기 ───────────────────────────


def row_of(store: Store, project_id: str, *, company: str | None) -> Any:
    """그 프로젝트의 행. 남의 회사 것은 **404**다 — 있다는 것조차 알리지 않는다 (C16)."""
    found = store.row("SELECT * FROM projects WHERE id = ?", (project_id,))
    if found is None or (company is not None and found["company"] != company):
        raise ApiError(404, "not_found", f"프로젝트가 없다: {project_id}")
    return found


def _info(store: Store, row: Any) -> ProjectInfo:
    # 「마지막 손댄 때」는 안의 작업공간까지 본다 — 프로세스를 고친 프로젝트가 카드 앞으로 온다.
    latest = store.row(
        "SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM workspaces WHERE project = ?", (row["id"],)
    )
    count = int(latest["n"]) if latest else 0
    at, by = row["updated_at"], row["updated_by"]
    if latest and latest["at"] and latest["at"] > at:
        newest = store.row(
            "SELECT updated_by FROM workspaces WHERE project = ? AND updated_at = ?", (row["id"], latest["at"])
        )
        at, by = latest["at"], newest["updated_by"] if newest else by
    return ProjectInfo(
        id=row["id"],
        name=row["name"],
        description=row["description"] or None,
        company=row["company"],
        processes=count,
        updated_at=at,
        updated_by=by,
    )


def listing(store: Store, *, company: str | None = None, q: str | None = None) -> list[ProjectInfo]:
    """목록 — 최근에 손댄 것부터. 회사가 정해진 쪽은 **제 회사만** 본다 (C16)."""
    sql = "SELECT * FROM projects"
    params: list[Any] = []
    if company is not None:
        sql += " WHERE company = ?"
        params.append(company)
    out = [_info(store, row) for row in store.rows(sql, params)]
    if q:
        needle = q.strip().lower()
        out = [one for one in out if needle in one.id.lower() or needle in one.name.lower()]
    out.sort(key=lambda one: one.id)
    out.sort(key=lambda one: one.updated_at, reverse=True)
    return out


def get(store: Store, *, project_id: str, company: str | None = None) -> ProjectInfo:
    return _info(store, row_of(store, project_id, company=company))


def workspaces_of(
    store: Store, *, workspace_dir: Path, project_id: str, company: str | None = None
) -> list[WorkspaceInfo]:
    """안의 작업공간 — **이름 차례**다 (표가 그 차례로 선다)."""
    row_of(store, project_id, company=company)
    out = workspaces.listing(store, workspace_dir=workspace_dir, company=company, project=project_id)
    return sorted(out, key=lambda one: (one.name, one.id))


# ─────────────────────────── 쓰기 ───────────────────────────


def create(store: Store, *, body: dict[str, Any], actor: str, company: str | None) -> ProjectInfo:
    """프로젝트 하나. **회사는 여기서 정해지고 바뀌지 않는다** (ADR-0175 §2)."""
    request = workspaces.model_of(ProjectCreateRequest, {"schema": 1, **body})
    owner = request.company or company or workspaces.default_company(store)
    if company is not None and owner != company:
        raise ApiError(403, "forbidden", "제 회사의 프로젝트만 만들 수 있다")
    if store.row("SELECT id FROM companies WHERE id = ?", (owner,)) is None:
        raise ApiError(422, "company_unknown", f"그 회사가 없다: {owner}")
    if store.row("SELECT id FROM projects WHERE id = ?", (request.id,)) is not None:
        raise ApiError(409, "exists", f"같은 id의 프로젝트가 있다: {request.id}")
    _insert(
        store, project_id=request.id, name=request.name, description=request.description, company=owner, actor=actor
    )
    return get(store, project_id=request.id)


def _insert(
    store: Store, *, project_id: str, name: str, description: str | None, company: str, actor: str
) -> None:
    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO projects (id, name, description, company, created_at, created_by, updated_at, updated_by)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (project_id, name, description, company, at, actor, at, actor),
        )


def default_for(store: Store, *, company: str, actor: str) -> str:
    """프로젝트를 고르지 않고 만든 작업공간이 가는 자리 — **id가 회사 id인 프로젝트**다.

    34판이 이미 있던 작업공간을 옮긴 자리와 같다 (ADR-0175 §6). 없으면 만든다 — 프로젝트를 모르는
    자동화가 그대로 돈다. 같은 id를 남의 회사가 쥐고 있으면 그 자리는 쓸 수 없다.
    """
    found = store.row("SELECT company FROM projects WHERE id = ?", (company,))
    if found is None:
        name_row = store.row("SELECT name FROM companies WHERE id = ?", (company,))
        name = str(name_row["name"]) if name_row else company
        _insert(store, project_id=company, name=name, description=None, company=company, actor=actor)
    elif found["company"] != company:
        raise ApiError(422, "project_required", "프로젝트를 골라야 한다 (회사의 기본 프로젝트 자리가 남의 것이다)")
    return company


def update(
    store: Store, *, project_id: str, body: dict[str, Any], actor: str, company: str | None
) -> ProjectInfo:
    """이름·설명. **생략한 칸은 그대로**이고 회사는 여기 없다."""
    row_of(store, project_id, company=company)
    request = workspaces.model_of(ProjectUpdateRequest, {"schema": 1, **body})
    sets: list[str] = []
    params: list[Any] = []
    if request.name is not None:
        sets.append("name = ?")
        params.append(request.name)
    if request.description is not None:
        sets.append("description = ?")
        params.append(request.description or None)
    sets += ["updated_at = ?", "updated_by = ?"]
    params += [now_iso(), actor, project_id]
    with store.tx() as cur:
        cur.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", params)  # noqa: S608 — 칸 이름은 위에서 고정
    return get(store, project_id=project_id)


def delete(store: Store, *, project_id: str, company: str | None) -> None:
    """지운다 — **비어 있을 때만** (409 `not_empty`). 안의 작업공간을 함께 지우지 않는다."""
    row_of(store, project_id, company=company)
    left = store.row("SELECT COUNT(*) AS n FROM workspaces WHERE project = ?", (project_id,))
    if left and int(left["n"]) > 0:
        raise ApiError(409, "not_empty", "프로세스가 든 프로젝트는 지우지 않는다", {"processes": int(left["n"])})
    with store.tx() as cur:
        cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))


# ─────────────────────────── 가져오기 ───────────────────────────


def import_zip(
    store: Store,
    *,
    workspace_dir: Path,
    project_id: str,
    raw: bytes,
    actor: str,
    company: str | None,
) -> ProjectImportResult:
    """옛 작업 폴더 zip → 작업공간 여럿 (ADR-0175 §5).

    `process.json`이 있는 폴더마다 작업공간 하나이고 id·이름·판은 그 기록의 것이다. **먼저 다 보고**
    하나라도 걸리면 아무것도 만들지 않는다. `libs/` 사본은 버리고 그 기록을 `libs_to_install`로 돌려준다 —
    받아 둔 공유 BPM 프로세스는 설치로만 들어온다 (C17 경로 규칙).
    """
    project = row_of(store, project_id, company=company)
    if len(raw) > workspaces.MAX_IMPORT_MB * 1024 * 1024:
        raise ApiError(413, "too_large", f"가져올 파일이 {workspaces.MAX_IMPORT_MB} MB를 넘는다")
    folders = _folders(raw)

    planned: list[tuple[str, dict[str, Any], dict[str, bytes]]] = []
    refused: list[str] = []
    seen: set[str] = set()
    for prefix, record, entries in folders:
        wid = str(record.get("id") or "")
        where = prefix.rstrip("/") or "(뿌리)"
        if not _valid_id(wid):
            refused.append(f"{where}: `process.json`의 id가 규칙에 맞지 않는다 ({wid or '빈 값'})")
            continue
        if wid in seen:
            refused.append(f"{where}: 같은 id가 zip 안에 둘이다 ({wid})")
            continue
        seen.add(wid)
        for path in sorted(entries):
            problem = check_file_path(path)
            if problem is not None:
                refused.append(f"{where}/{path}: {problem}")
        planned.append((wid, record, entries))
    if refused:
        raise ApiError(422, "bad_path", "가져올 수 없는 것이 있다", {"paths": refused})

    taken = [wid for wid, _, _ in planned if store.row("SELECT id FROM workspaces WHERE id = ?", (wid,))]
    taken += [wid for wid, _, _ in planned if wid not in taken and workspaces.folder_of(workspace_dir, wid).exists()]
    if taken:
        raise ApiError(409, "exists", "같은 id의 프로세스가 이미 있다", {"ids": sorted(taken)})

    made: list[WorkspaceInfo] = []
    libs: list[LibToInstall] = []
    for wid, record, entries in planned:
        record = dict(record)
        for lib in record.pop("libs", None) or []:
            if isinstance(lib, dict) and lib.get("id") and lib.get("version"):
                libs.append(LibToInstall(workspace_id=wid, package_id=str(lib["id"]), version=str(lib["version"])))
        record["id"] = wid
        workspaces.create(
            store,
            workspace_dir=workspace_dir,
            body={
                "id": wid,
                "name": str(record.get("name") or wid)[:100],
                "version": str(record.get("version") or "0.1.0"),
                "project": project_id,
            },
            actor=actor,
            company=company,
        )
        root = workspaces.folder_of(workspace_dir, wid)
        entries = {**entries, PROCESS_JSON: workspaces.record_bytes(record)}
        for path in sorted(entries):
            workspaces.put_file(store, root=root, workspace_id=wid, path=path, data=entries[path], actor=actor)
        made.append(workspaces.get(store, workspace_dir=workspace_dir, workspace_id=wid))
    with store.tx() as cur:
        cur.execute(
            "UPDATE projects SET updated_at = ?, updated_by = ? WHERE id = ?", (now_iso(), actor, project["id"])
        )
    return ProjectImportResult(workspaces=made, libs_to_install=libs)


def _valid_id(value: str) -> bool:
    return re.fullmatch(WORKSPACE_ID_PATTERN, value) is not None


def _folders(raw: bytes) -> list[tuple[str, dict[str, Any], dict[str, bytes]]]:
    """zip → `(앞자리, 기록, {폴더 안 경로: 본문})`. 파일은 **가장 깊은** 작업 폴더에 붙는다.

    `libs/`는 여기서 버린다 — 경로 규칙이 쓰기를 막는 자리이고, 설치가 다시 넣는다.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = [one for one in archive.namelist() if not one.endswith("/")]
            if len(names) > workspaces.MAX_FILES:
                raise ApiError(422, "zip_too_many_entries", f"zip 항목이 {workspaces.MAX_FILES}개를 넘는다")
            prefixes = sorted(
                (name[: -len(PROCESS_JSON)] for name in names if Path(name).name == PROCESS_JSON),
                key=len,
                reverse=True,
            )
            if not prefixes:
                raise ApiError(422, "no_process", "zip에 `process.json`이 하나도 없다 — 작업 폴더가 아니다")
            files: dict[str, dict[str, bytes]] = {prefix: {} for prefix in prefixes}
            for name in names:
                owner = next((prefix for prefix in prefixes if name.startswith(prefix)), None)
                if owner is None:
                    continue  # 어느 작업 폴더에도 들지 않는 것 (README 따위)
                rest = name[len(owner) :]
                if rest == PROCESS_JSON or rest.split("/", 1)[0] == "libs":
                    continue
                files[owner][rest] = archive.read(name)
            out: list[tuple[str, dict[str, Any], dict[str, bytes]]] = []
            for prefix in sorted(prefixes):
                try:
                    record = json.loads(archive.read(prefix + PROCESS_JSON).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as e:
                    raise ApiError(422, "bad_process", f"`{prefix}{PROCESS_JSON}`을 읽지 못했다") from e
                if not isinstance(record, dict):
                    raise ApiError(422, "bad_process", f"`{prefix}{PROCESS_JSON}`이 객체가 아니다")
                out.append((prefix, record, files[prefix]))
            return out
    except zipfile.BadZipFile as e:
        raise ApiError(422, "bad_zip", "zip으로 읽지 못했다") from e
