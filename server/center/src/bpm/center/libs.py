"""공유 BPM 프로세스 설치 — 받아 둔 것을 작업 폴더의 `libs/`에 푼다 (C17,
[ADR-0048](../../../../../docs/decisions/0048-installing-shared-packages.md)).

데스크톱 Studio의 STU-11이 하던 일이고, 설계가 콘솔로 오면서 **Center가 한다**
([ADR-0143](../../../../../docs/decisions/0143-design-happens-in-the-console.md)) — 패키지가
Center에 있으니 받아 올 것도 없다.

지키는 것 다섯은 Studio가 지키던 그대로다.

- **자리는 작업 폴더의 `libs/`이고 평평하다.** 실행기가 `libs/*.bpmn`만 글롭하므로 하위 폴더를
  쓰면 현장에서 못 찾는다 (`core.testrun.workspace`). 그래서 파일 이름에 **패키지 id를 붙이고**
  (`<id>__<이름>`), 어느 파일이 어느 판의 것인지는 **기록(`process.json`)이 안다** — 제거가
  그것만 지운다.
- **아무 패키지나 풀지 않는다** — `kind=process_lib`이어야 한다. `bpm_process`를 lib으로 풀면
  진입 정의가 남의 `libs/`에서 돌게 된다.
- **정의와 결정표를 함께 푼다** (`process/*.bpmn`·`*.dmn`) — 규칙 태스크를 쓰는 공유 BPM
  프로세스가 돌아야 하고, 읽는 쪽(시험 실행·실행기)이 둘 다 본다. 한쪽만 풀면 「편집기에서는
  되는데 현장에서 안 된다」가 된다.
- **같은 패키지가 이미 있으면 갈아 치운다** — 「갱신」이 그 길이다. 옛 판의 파일을 먼저 지운다
  (남겨 두면 글롭하는 쪽이 **두 판을 함께** 읽는다).
- **받은 것은 편집 대상이 아니다** — C17의 파일 쓰기가 `libs/`를 거부하는 까닭이다. 여기만
  `put_file`을 직접 부른다.

판은 기록에 남고 배포 후보를 지을 때 `requires.libs`로 간다 (C1 — 짓는 것은 실행기다).
"""

from __future__ import annotations

import io
import logging
import zipfile
from pathlib import Path
from typing import Any

from bpm.center import workspaces
from bpm.center.errors import ApiError
from bpm.center.storage import Store
from bpm.contracts.bpmn_ext import BpmnReadError, read_process
from bpm.contracts.manifest import Manifest
from bpm.contracts.workspace import LibInstallRequest, WorkspaceInfo

log = logging.getLogger(__name__)

#: 받을 수 있는 갈래 (C1). 「설치」는 공유 BPM 프로세스만 한다.
KIND_LIB = "process_lib"

#: 패키지 안에서 정의·결정표가 사는 곳 (C1 §패키지 구성).
PROCESS_DIR = "process/"

#: 푸는 것 — 정의와 그것이 쓰는 결정표. 그 밖(케이스·기록)은 lib에 없다.
SUFFIXES = (".bpmn", ".dmn")


def _record_libs(record: dict[str, Any]) -> list[dict[str, Any]]:
    raw = record.get("libs")
    return [one for one in raw if isinstance(one, dict)] if isinstance(raw, list) else []


def definitions_in(raw: bytes, *, package_id: str, version: str) -> dict[str, str]:
    """패키지 zip에서 **정의와 결정표**를 꺼낸다.

    매니페스트를 먼저 보고 **갈래·id·판이 맞는지** 확인한다 — 받으려던 것과 다른 것이 오면
    풀지 않는다. 폴더 구조를 믿지 않고 **이름으로** 고른다.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as e:
        raise ApiError(422, "bad_package", f"{package_id} {version}: 패키지가 zip이 아니다") from e
    with archive:
        try:
            manifest = Manifest.model_validate_json(archive.read("manifest.json"))
        except (KeyError, ValueError) as e:
            raise ApiError(422, "bad_package", f"{package_id} {version}: 매니페스트를 읽지 못했다") from e
        if manifest.kind != KIND_LIB:
            raise ApiError(
                422, "wrong_kind", f"공유 프로세스가 아니다: {package_id}는 {manifest.kind}다"
            )
        if manifest.id != package_id or manifest.version != version:
            raise ApiError(
                422,
                "wrong_package",
                f"받으려던 것과 다르다: {manifest.id}@{manifest.version}",
            )
        found: dict[str, str] = {}
        for name in archive.namelist():
            if not name.startswith(PROCESS_DIR) or not name.endswith(SUFFIXES):
                continue
            found[name] = archive.read(name).decode("utf-8")
    if not found:
        raise ApiError(422, "no_definitions", f"{package_id} {version}에 정의가 없다 (풀 것이 없다)")
    return found


def _provided(file_name: str, text: str) -> str | None:
    """그 파일이 주는 BPMN 프로세스 id (`calledElement`가 가리키는 것).

    **읽지 못한 정의는 호출할 수 없다** — 파일은 그대로 두고 목록에만 넣지 않는다 (B14가 말한다).
    """
    if not file_name.endswith(".bpmn"):
        return None  # 결정표는 호출 대상이 아니다
    try:
        return read_process(text).id
    except BpmnReadError:
        return None


def install(
    store: Store,
    *,
    workspace_dir: Path,
    package_dir: Path,
    workspace_id: str,
    body: dict[str, Any],
    actor: str,
    company: str | None,
) -> WorkspaceInfo:
    """공유 BPM 프로세스 하나를 `libs/`에 푼다. 같은 id가 있으면 **갈아 치운다**."""
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    request = workspaces.model_of(LibInstallRequest, {"schema": 1, **body})
    row = store.row(
        "SELECT * FROM packages WHERE id = ? AND version = ?", (request.package_id, request.version)
    )
    if row is None:
        raise ApiError(404, "not_found", f"{request.package_id}@{request.version}이 없다")
    # **철회된 것은 받지 않는다** — 철회는 보안 동작이고, 푼 뒤에는 거둘 길이 없다 (C2).
    if row["status"] == "revoked":
        raise ApiError(410, "revoked", "철회된 패키지다")
    path = package_dir / row["file_name"]
    if not path.exists():
        raise ApiError(500, "file_missing", "메타데이터는 있는데 파일이 없다 (저장소를 확인하세요)")

    definitions = definitions_in(
        path.read_bytes(), package_id=request.package_id, version=request.version
    )

    root = workspaces.folder_of(workspace_dir, workspace_id)
    _forget(store, root=root, workspace_id=workspace_id, package_id=request.package_id, actor=actor)

    files, provides = [], []
    for name, text in sorted(definitions.items()):
        file_name = f"{request.package_id}__{Path(name).name}"
        # **`libs/`는 파일 쓰기 API가 거부한다** (C17 경로 규칙) — 설치만 이 길로 넣는다.
        workspaces.put_file(
            store,
            root=root,
            workspace_id=workspace_id,
            path=f"libs/{file_name}",
            data=text.encode("utf-8"),
            actor=actor,
        )
        files.append(file_name)
        made = _provided(file_name, text)
        if made:
            provides.append(made)

    record = workspaces.read_record(root)
    # **같은 id의 옛 줄을 먼저 뺀다** — `_forget`은 파일만 지운다. 남겨 두면 한 패키지가 두 줄이
    # 되어 `requires.libs`에 판이 둘 들어간다.
    record["libs"] = [
        *(one for one in _record_libs(record) if one.get("id") != request.package_id),
        {
            "id": request.package_id,
            "version": request.version,
            "files": files,
            "processes": sorted(set(provides)),
        },
    ]
    _write_record(store, root=root, workspace_id=workspace_id, record=record, actor=actor)
    return workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id)


def remove(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    package_id: str,
    actor: str,
    company: str | None,
) -> WorkspaceInfo:
    """받아 둔 것 하나를 지운다. **기록이 적어 둔 파일만** — `libs/`를 비우면 다른 판까지 날아간다."""
    workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id, company=company)
    root = workspaces.folder_of(workspace_dir, workspace_id)
    record = workspaces.read_record(root)
    if not any(one.get("id") == package_id for one in _record_libs(record)):
        raise ApiError(404, "not_found", f"받아 둔 것이 아니다: {package_id}")
    _forget(store, root=root, workspace_id=workspace_id, package_id=package_id, actor=actor)
    record = workspaces.read_record(root)
    record["libs"] = [one for one in _record_libs(record) if one.get("id") != package_id]
    _write_record(store, root=root, workspace_id=workspace_id, record=record, actor=actor)
    return workspaces.get(store, workspace_dir=workspace_dir, workspace_id=workspace_id)


def _forget(store: Store, *, root: Path, workspace_id: str, package_id: str, actor: str) -> None:
    """그 패키지가 넣었던 파일을 지운다 (없으면 아무 일도 하지 않는다)."""
    record = workspaces.read_record(root)
    found = next((one for one in _record_libs(record) if one.get("id") == package_id), None)
    if found is None:
        return
    names = [str(one) for one in found.get("files", []) if isinstance(one, str)]
    with store.tx() as cur:
        for name in names:
            cur.execute(
                "DELETE FROM workspace_files WHERE workspace_id = ? AND path = ?",
                (workspace_id, f"libs/{name}"),
            )
    for name in names:
        (root / "libs" / name).unlink(missing_ok=True)


def _write_record(
    store: Store, *, root: Path, workspace_id: str, record: dict[str, Any], actor: str
) -> None:
    record.setdefault("schema", workspaces.RECORD_SCHEMA)
    record["id"] = workspace_id
    workspaces.put_file(
        store,
        root=root,
        workspace_id=workspace_id,
        path=workspaces.PROCESS_JSON,
        data=workspaces.record_bytes(record),
        actor=actor,
    )
