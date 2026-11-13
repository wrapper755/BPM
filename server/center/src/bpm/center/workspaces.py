"""작업공간 — Center가 BPM 프로세스 작업 폴더를 들고 있다 (C17,
[ADR-0143](../../../../../docs/decisions/0143-design-happens-in-the-console.md)).

**파일이 원본이다.** 디스크에 작업 폴더 그대로 두고(`<데이터 폴더>/workspaces/<id>/`) DB에는
**Center의 사실만** 둔다 — 누구 회사이고 누가 언제 고쳤나. 설계 값(이름·판·설명·진입 정의·자리)은
`process.json`이 들고 있고 이 모듈은 그것을 읽어 보인다. 패키지 zip을 다루는 방식과 같다
(01-architecture §7 — DB에는 메타데이터만).

**Center는 BPMN을 해석하지 않는다** — 글자 그대로 담고 돌려준다. 그림을 고치는 것은 캔버스이고
(ADR-0022) 돌리고 검사하고 짓는 것은 서버 실행기다
([ADR-0146](../../../../../docs/decisions/0146-design-work-has-its-own-lane.md)).
그래서 여기에는 `bpm.core`가 하나도 없다 — 의존 방향이 그것을 막는다.

세 가지가 규칙이다.

- **경로를 믿지 않는다** — 계약의 `check_file_path()` 하나가 본다. 그 뒤에 **푼 자리가 정말 폴더
  안인지** 한 번 더 본다 (심볼릭 링크는 계약이 알 수 없다).
- **덮어쓰기를 막는다** — 쓰기는 `If-Match`에 지금 `revision`을 싣는다. 다르면 409 `stale`이고
  **아무것도 쓰지 않는다**. 합치지 않는다 — 합치면 XML이 깨진다.
- **검사는 쓰기를 막지 않는다** — 반쯤 그린 그림을 저장하지 못하면 설계가 되지 않는다. C14
  B1~B17은 돌리기 전에 본다 (C17 §실행 전 검사).
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from bpm.center.errors import ApiError
from bpm.center.storage import Store, now_iso
from bpm.contracts.organization import Place
from bpm.contracts.workspace import (
    PROCESS_JSON,
    FileInfo,
    WorkspaceCreateRequest,
    WorkspaceInfo,
    WorkspaceUpdateRequest,
    check_file_path,
)

#: `process.json`의 판 (`core.testrun.workspace.SCHEMA`와 같아야 한다 — 실행기가 읽는다).
RECORD_SCHEMA = 1

#: 작업 폴더 하나의 파일 수·크기 상한. 올리는 쪽이 실수로 저장소를 채우는 것을 막는다.
MAX_FILES = 2000
MAX_FILE_MB = 8

#: 가져올 zip의 상한 (패키지 올리기와 같은 결 — `api/packages.check_zip_safety`).
MAX_IMPORT_MB = 64


def _model(model: Any, body: Any) -> Any:
    """요청 본문을 계약 모델로 — 맞지 않으면 422다 (`center.organization`과 같은 자리)."""
    try:
        return model.model_validate(body)
    except ValidationError as e:
        raise ApiError(422, "input_invalid", "요청이 계약과 맞지 않는다", {"errors": e.errors()}) from e


def revision_of(data: bytes) -> str:
    """파일 하나의 `revision` — **내용 해시**다 (C2 `content_hash`와 같은 셈)."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def bundle_revision(files: list[FileInfo]) -> str:
    """작업공간 전체의 `revision` — 파일이 하나라도 바뀌면 달라진다.

    검사 캐시의 열쇠이고(ADR-0146) 실행기가 집어 갈 묶음의 이름이다. **경로까지 센다** — 내용이
    같은 파일을 옮기기만 해도 다른 묶음이다.
    """
    digest = hashlib.sha256()
    for one in sorted(files, key=lambda f: f.path):
        digest.update(one.path.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(one.revision.encode("utf-8"))
        digest.update(b"\n")
    return f"sha256:{digest.hexdigest()}"


# ─────────────────────────── 자리 ───────────────────────────


def folder_of(workspace_dir: Path, workspace_id: str) -> Path:
    """그 작업공간의 폴더. **id는 계약이 이미 좁혀 두었다** (`^[a-z0-9][a-z0-9._-]{0,63}$`)."""
    return workspace_dir / workspace_id


def _inside(root: Path, path: str) -> Path:
    """`root` 아래의 그 파일 — **정말 안에 있는지** 한 번 더 본다.

    계약의 `check_file_path()`가 모양을 보고, 여기서는 **푼 자리**를 본다. 심볼릭 링크는 계약이
    알 수 없다 — 파일 시스템만 안다.
    """
    problem = check_file_path(path)
    if problem is not None:
        raise ApiError(422, "bad_path", problem, {"path": path})
    found = root / path
    try:
        resolved = found.resolve()
        base = root.resolve()
    except OSError as e:  # pragma: no cover - 방어 (폴더가 사라진 경우)
        raise ApiError(422, "bad_path", f"경로를 풀 수 없다: {path}") from e
    if base != resolved and base not in resolved.parents:
        raise ApiError(422, "bad_path", "작업 폴더 밖을 가리킨다", {"path": path})
    return found


# ─────────────────────────── 기록 (process.json) ───────────────────────────


def read_record(root: Path) -> dict[str, Any]:
    """`process.json`을 읽는다. 없거나 읽히지 않으면 빈 사전이다 (고쳐 쓰지 않는다)."""
    found = root / PROCESS_JSON
    if not found.is_file():
        return {}
    try:
        raw = json.loads(found.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return raw if isinstance(raw, dict) else {}


def record_bytes(record: dict[str, Any]) -> bytes:
    """기록을 파일로 쓸 모양 — 실행기의 `core.testrun.workspace`가 읽는 그 모양이다."""
    return (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _place_of(record: dict[str, Any]) -> Place | None:
    raw = record.get("place")
    if not isinstance(raw, dict) or not raw:
        return None
    try:
        return Place.model_validate(raw)
    except ValueError:
        # **기록이 깨졌다고 작업공간을 숨기지 않는다** — 자리만 비워 보인다.
        return None


# ─────────────────────────── 읽기 ───────────────────────────


def _row(store: Store, workspace_id: str, *, company: str | None) -> Any:
    found = store.row("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
    if found is None:
        raise ApiError(404, "not_found", f"작업공간이 없다: {workspace_id}")
    # 남의 회사 것은 **404**다 — 있다는 것조차 알리지 않는다 (C16과 같은 결).
    if company is not None and found["company"] != company:
        raise ApiError(404, "not_found", f"작업공간이 없다: {workspace_id}")
    return found


def _info(store: Store, workspace_dir: Path, row: Any) -> WorkspaceInfo:
    record = read_record(folder_of(workspace_dir, row["id"]))
    return WorkspaceInfo(
        id=row["id"],
        name=str(record.get("name") or row["id"]),
        version=str(record.get("version") or "0.1.0"),
        description=str(record.get("description") or "") or None,
        company=row["company"],
        place=_place_of(record),
        entry=str(record.get("entry") or "") or None,
        updated_at=row["updated_at"],
        updated_by=row["updated_by"],
        revision=bundle_revision(files(store, row["id"])),
    )


def listing(
    store: Store, *, workspace_dir: Path, company: str | None = None, q: str | None = None
) -> list[WorkspaceInfo]:
    """목록 — 최근에 고친 것부터. 회사가 정해진 쪽은 **제 회사만** 본다 (C16)."""
    sql = "SELECT * FROM workspaces"
    params: list[Any] = []
    if company is not None:
        sql += " WHERE company = ?"
        params.append(company)
    sql += " ORDER BY updated_at DESC, id"
    out = [_info(store, workspace_dir, row) for row in store.rows(sql, params)]
    if q:
        needle = q.strip().lower()
        out = [one for one in out if needle in one.id.lower() or needle in one.name.lower()]
    return out


def get(store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None = None) -> WorkspaceInfo:
    return _info(store, workspace_dir, _row(store, workspace_id, company=company))


def files(store: Store, workspace_id: str) -> list[FileInfo]:
    """작업 폴더 안 파일 — **DB가 말해 준다**. 디스크를 훑지 않는다(`updated_by`를 파일이 모른다)."""
    return [
        FileInfo(
            path=row["path"],
            size_bytes=row["size_bytes"],
            revision=row["revision"],
            updated_at=row["updated_at"],
            updated_by=row["updated_by"],
        )
        for row in store.rows(
            "SELECT * FROM workspace_files WHERE workspace_id = ? ORDER BY path", (workspace_id,)
        )
    ]


def read_file(
    store: Store, *, workspace_dir: Path, workspace_id: str, path: str, company: str | None = None
) -> tuple[bytes, str]:
    """`(본문, revision)`. `ETag`가 `revision`이다."""
    _row(store, workspace_id, company=company)
    found = _inside(folder_of(workspace_dir, workspace_id), path)
    row = store.row(
        "SELECT revision FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, path)
    )
    if row is None or not found.is_file():
        raise ApiError(404, "not_found", f"파일이 없다: {path}")
    return found.read_bytes(), row["revision"]


# ─────────────────────────── 쓰기 ───────────────────────────


def create(
    store: Store,
    *,
    workspace_dir: Path,
    body: dict[str, Any],
    actor: str,
    company: str | None,
) -> WorkspaceInfo:
    """빈 한 벌을 만든다 — `process/`·`cases/`와 `process.json`.

    **회사는 만들 때 정해지고 바뀌지 않는다** (C16). 비우면 부르는 쪽의 회사이고, Center 관리자가
    비우면 기본 회사다.
    """
    request = _model(WorkspaceCreateRequest, {"schema": 1, **body})
    owner = request.company or company
    if owner is None:
        owner = _default_company(store)
    if company is not None and owner != company:
        raise ApiError(403, "forbidden", "제 회사의 작업공간만 만들 수 있다")
    if store.row("SELECT id FROM workspaces WHERE id = ?", (request.id,)) is not None:
        raise ApiError(409, "exists", f"같은 id의 작업공간이 있다: {request.id}")
    _refuse_unknown_place(store, request.place, company=owner)

    root = folder_of(workspace_dir, request.id)
    if root.exists():
        # DB에는 없는데 폴더가 남아 있다 — 지우지 않는다. 사람이 보고 정한다.
        raise ApiError(409, "exists", f"그 자리에 폴더가 이미 있다: {request.id}")
    (root / "process").mkdir(parents=True)
    (root / "cases").mkdir(parents=True)

    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO workspaces (id, company, created_at, created_by, updated_at, updated_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (request.id, owner, at, actor, at, actor),
        )
    record: dict[str, Any] = {
        "schema": RECORD_SCHEMA,
        "id": request.id,
        "name": request.name,
        "version": request.version,
        "entry": "",
    }
    if request.description:
        record["description"] = request.description
    if request.place is not None:
        record["place"] = request.place.to_json_dict()
    _put(store, root=root, workspace_id=request.id, path=PROCESS_JSON, data=record_bytes(record), actor=actor)
    return get(store, workspace_dir=workspace_dir, workspace_id=request.id)


def update(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    body: dict[str, Any],
    actor: str,
    company: str | None,
) -> WorkspaceInfo:
    """이름·판·설명·업무 자리·진입 정의 (STU-06이 하던 일).

    **생략한 칸은 그대로 두고, 모르는 칸은 버리지 않는다** — 담당자·태그처럼 매니페스트에 칸이
    없는 값도 기록에는 남는다 (C17 §모델).
    """
    row = _row(store, workspace_id, company=company)
    request = _model(WorkspaceUpdateRequest, {"schema": 1, **body})
    root = folder_of(workspace_dir, workspace_id)
    record = read_record(root)
    record.setdefault("schema", RECORD_SCHEMA)
    record["id"] = workspace_id
    if request.name is not None:
        record["name"] = request.name
    if request.version is not None:
        record["version"] = request.version
    if request.description is not None:
        record["description"] = request.description
    if request.place is not None:
        _refuse_unknown_place(store, request.place, company=row["company"])
        record["place"] = request.place.to_json_dict()
    if request.entry is not None:
        _refuse_missing_entry(store, workspace_id, request.entry)
        record["entry"] = request.entry
    _put(store, root=root, workspace_id=workspace_id, path=PROCESS_JSON, data=record_bytes(record), actor=actor)
    return get(store, workspace_dir=workspace_dir, workspace_id=workspace_id)


#: 작업공간에 매달린 표 — **지울 때 함께 지운다** (업무 값·로그가 담겨 있다).
#: SQL을 여기 두는 까닭: `trials`·`design_work`가 이 모듈을 import하므로 거꾸로는 못 부른다
#: (import 방향이 막는다). **표를 늘리면 이 목록에 더한다** — 로컬 compose가 고아 셋을 드러냈다.
CHILD_TABLES = ("workspace_files", "test_runs", "workspace_checks", "workspace_builds")


def delete(
    store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None
) -> None:
    """지운다. **배포된 패키지는 그대로다** — 패키지가 원본이고 작업공간은 그것을 짓는 자리다.

    **매달린 것은 함께 지운다** (`CHILD_TABLES`) — 시험 실행의 로그·변수와 검사 결과는 업무
    값이고, 작업공간이 없어진 뒤에 남아 있으면 누구도 지울 수 없는 고아가 된다.
    """
    _row(store, workspace_id, company=company)
    with store.tx() as cur:
        for table in CHILD_TABLES:
            cur.execute(f"DELETE FROM {table} WHERE workspace_id = ?", (workspace_id,))  # noqa: S608 — 위 표 목록만
        cur.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
    root = folder_of(workspace_dir, workspace_id)
    if root.is_dir():
        _remove_tree(root)


def write_file(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    path: str,
    data: bytes,
    if_match: str | None,
    actor: str,
    company: str | None,
) -> tuple[FileInfo, bool]:
    """파일 하나를 쓴다 — `(정보, 새로 만들었나)`.

    **`If-Match`가 지금 `revision`과 다르면 409 `stale`이고 아무것도 쓰지 않는다.** 두 사람이 같은
    파일을 열면 나중 사람이 그것을 받는다 — 합치지 않는다 (합치면 XML이 깨진다).

    **이미 있는 파일에는 `If-Match`를 요구한다** — 없이 쓰면 남의 편집을 조용히 덮는다. 새 파일은
    맞출 것이 없으니 요구하지 않는다.
    """
    _row(store, workspace_id, company=company)
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise ApiError(413, "too_large", f"파일이 {MAX_FILE_MB} MB를 넘는다")
    root = folder_of(workspace_dir, workspace_id)
    found = _inside(root, path)
    row = store.row(
        "SELECT revision FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, path)
    )
    if row is None:
        count = store.row("SELECT COUNT(*) AS n FROM workspace_files WHERE workspace_id = ?", (workspace_id,))
        if count is not None and count["n"] >= MAX_FILES:
            raise ApiError(409, "too_many_files", f"작업 폴더의 파일이 {MAX_FILES}개를 넘는다")
    else:
        if if_match is None:
            raise ApiError(428, "if_match_required", "있는 파일을 고칠 때는 지금 revision을 If-Match에 싣는다")
        if if_match != row["revision"]:
            raise ApiError(
                409,
                "stale",
                "그 사이 다른 사람이 고쳤다 — 아무것도 쓰지 않았다",
                {"path": path, "revision": row["revision"]},
            )
    found.parent.mkdir(parents=True, exist_ok=True)
    _put(store, root=root, workspace_id=workspace_id, path=path, data=data, actor=actor)
    return _file_info(store, workspace_id, path), row is None


def delete_file(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    path: str,
    actor: str,
    company: str | None,
) -> None:
    """파일 하나를 지운다. **진입 정의는 거절한다** — 돌릴 수 없는 작업공간이 조용히 생긴다."""
    _row(store, workspace_id, company=company)
    root = folder_of(workspace_dir, workspace_id)
    found = _inside(root, path)
    row = store.row(
        "SELECT path FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, path)
    )
    if row is None:
        raise ApiError(404, "not_found", f"파일이 없다: {path}")
    if path == PROCESS_JSON:
        raise ApiError(409, "entry_in_use", "작업 폴더의 기록은 지울 수 없다")
    record = read_record(root)
    if str(record.get("entry") or "") == path:
        raise ApiError(409, "entry_in_use", f"진입 정의는 지울 수 없다: {path}")
    with store.tx() as cur:
        cur.execute(
            "DELETE FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, path)
        )
        cur.execute(
            "UPDATE workspaces SET updated_at = ?, updated_by = ? WHERE id = ?",
            (now_iso(), actor, workspace_id),
        )
    found.unlink(missing_ok=True)


# ─────────────────────────── 묶음 ───────────────────────────


def bundle(
    store: Store, *, workspace_dir: Path, workspace_id: str, company: str | None = None
) -> tuple[bytes, str]:
    """작업 폴더를 zip 한 덩이로 — `(zip, revision)`.

    **파일을 그대로 담을 뿐 매니페스트를 짓지 않는다** (짓는 것은 그림을 읽는 일이라 Center가 못
    한다). **케이스도 담는다** — 배포 패키지와 다른 점이다 (C1).
    """
    _row(store, workspace_id, company=company)
    listed = files(store, workspace_id)
    root = folder_of(workspace_dir, workspace_id)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as made:
        for one in sorted(listed, key=lambda f: f.path):
            found = root / one.path
            if found.is_file():
                made.writestr(one.path, found.read_bytes())
    return out.getvalue(), bundle_revision(listed)


def import_into(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    raw: bytes,
    file_name: str,
    actor: str,
    company: str | None,
) -> list[FileInfo]:
    """밖에서 그린 그림·옛 작업 폴더 zip을 넣는다 (ADR-0143 §2).

    **`.bpmn` 하나면 `process/`에 놓고**, zip이면 **경로 규칙을 지나는 것만** 넣는다. 지나지 못한
    것은 **조용히 버리지 않고** 사유와 함께 422로 돌려준다 — 「넣었는데 없다」가 가장 나쁘다.
    """
    _row(store, workspace_id, company=company)
    if len(raw) > MAX_IMPORT_MB * 1024 * 1024:
        raise ApiError(413, "too_large", f"가져올 파일이 {MAX_IMPORT_MB} MB를 넘는다")
    root = folder_of(workspace_dir, workspace_id)

    if file_name.lower().endswith(".bpmn"):
        wanted = {f"process/{Path(file_name).name}": raw}
    else:
        wanted = _zip_entries(raw)

    refused: list[str] = []
    for path in sorted(wanted):
        problem = check_file_path(path)
        if problem is not None:
            refused.append(f"{path}: {problem}")
    if refused:
        raise ApiError(422, "bad_path", "가져올 수 없는 경로가 있다", {"paths": refused})

    out: list[FileInfo] = []
    for path in sorted(wanted):
        found = _inside(root, path)
        found.parent.mkdir(parents=True, exist_ok=True)
        _put(store, root=root, workspace_id=workspace_id, path=path, data=wanted[path], actor=actor)
        out.append(_file_info(store, workspace_id, path))
    return out


def _zip_entries(raw: bytes) -> dict[str, bytes]:
    """zip 안의 파일 — **작업 폴더 뿌리를 찾아** 그 아래 경로로 바꾼다.

    옛 Studio 작업 폴더를 통째로 담으면 `<id>/process/main.bpmn`처럼 한 겹이 더 있다. `process.json`이
    있는 자리를 뿌리로 본다 — 없으면 zip의 뿌리가 그것이다.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = [one for one in archive.namelist() if not one.endswith("/")]
            if len(names) > MAX_FILES:
                raise ApiError(422, "zip_too_many_entries", f"zip 항목이 {MAX_FILES}개를 넘는다")
            prefix = ""
            for name in names:
                if Path(name).name == PROCESS_JSON:
                    prefix = name[: -len(PROCESS_JSON)]
                    break
            out: dict[str, bytes] = {}
            for name in names:
                if prefix and not name.startswith(prefix):
                    continue
                out[name[len(prefix) :]] = archive.read(name)
            return out
    except zipfile.BadZipFile as e:
        raise ApiError(422, "bad_zip", "zip으로 읽지 못했다") from e


# ─────────────────────────── 거드는 것 ───────────────────────────


def _put(store: Store, *, root: Path, workspace_id: str, path: str, data: bytes, actor: str) -> None:
    """파일을 쓰고 DB의 기록을 맞춘다. **파일을 먼저 쓴다** — 쓰다 실패하면 행이 거짓이 된다."""
    found = root / path
    found.parent.mkdir(parents=True, exist_ok=True)
    found.write_bytes(data)
    at = now_iso()
    with store.tx() as cur:
        cur.execute(
            "INSERT INTO workspace_files (workspace_id, path, revision, size_bytes, updated_at, updated_by) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (workspace_id, path) DO UPDATE SET "
            "revision = excluded.revision, size_bytes = excluded.size_bytes, "
            "updated_at = excluded.updated_at, updated_by = excluded.updated_by",
            (workspace_id, path, revision_of(data), len(data), at, actor),
        )
        cur.execute(
            "UPDATE workspaces SET updated_at = ?, updated_by = ? WHERE id = ?", (at, actor, workspace_id)
        )


def _file_info(store: Store, workspace_id: str, path: str) -> FileInfo:
    row = store.row(
        "SELECT * FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, path)
    )
    assert row is not None, "방금 쓴 파일이다"
    return FileInfo(
        path=row["path"],
        size_bytes=row["size_bytes"],
        revision=row["revision"],
        updated_at=row["updated_at"],
        updated_by=row["updated_by"],
    )


def _default_company(store: Store) -> str:
    """회사를 적지 않은 Center 관리자가 만들 때 — **회사가 하나면 그것**이다."""
    rows = store.rows("SELECT id FROM companies ORDER BY id LIMIT 2")
    if len(rows) == 1:
        return str(rows[0]["id"])
    raise ApiError(422, "company_required", "회사를 적어야 한다 (회사가 여럿이다)")


def _refuse_unknown_place(store: Store, place: Place | None, *, company: str) -> None:
    """업무 자리의 부서·직원이 **그 회사 안인가** (C16, ADR-0127) — 올리기와 같은 대조다."""
    if place is None:
        return
    if place.department is not None:
        row = store.row("SELECT company FROM departments WHERE id = ?", (place.department,))
        if row is None or row["company"] != company:
            raise ApiError(422, "place_unknown", f"그 회사의 부서가 아니다: {place.department}")
    if place.staff is not None:
        row = store.row("SELECT company FROM staff WHERE id = ?", (place.staff,))
        if row is None or row["company"] != company:
            raise ApiError(422, "place_unknown", f"그 회사의 직원이 아니다: {place.staff}")


def _refuse_missing_entry(store: Store, workspace_id: str, entry: str) -> None:
    """진입 정의로 **없는 파일**을 적지 못한다 — 돌릴 때야 드러나면 사람이 엉뚱한 데를 고친다."""
    if not entry:
        return
    problem = check_file_path(entry)
    if problem is not None:
        raise ApiError(422, "bad_path", problem, {"path": entry})
    if not entry.endswith(".bpmn"):
        raise ApiError(422, "bad_path", "진입 정의는 `.bpmn`이다", {"path": entry})
    row = store.row(
        "SELECT path FROM workspace_files WHERE workspace_id = ? AND path = ?", (workspace_id, entry)
    )
    if row is None:
        raise ApiError(422, "no_entry", f"그 정의가 작업 폴더에 없다: {entry}")


def _remove_tree(root: Path) -> None:
    """폴더 하나를 지운다 (표준 라이브러리만 — `shutil.rmtree`는 심볼릭 링크를 따라가지 않는다)."""
    import shutil

    shutil.rmtree(root, ignore_errors=True)


__all__ = [
    "CHILD_TABLES",
    "MAX_FILES",
    "MAX_FILE_MB",
    "MAX_IMPORT_MB",
    "PROCESS_JSON",
    "RECORD_SCHEMA",
    "bundle",
    "bundle_revision",
    "create",
    "delete",
    "delete_file",
    "files",
    "folder_of",
    "get",
    "import_into",
    "listing",
    "read_file",
    "read_record",
    "record_bytes",
    "revision_of",
    "update",
    "write_file",
]
