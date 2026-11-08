"""일꾼 폴더 — Center가 **뜰 때** 일꾼을 **처음 한 번** 들이고 폴더 키를 들인다 (ADR-0122·0137, C15).

일꾼의 원본은 Center DB이고 Center 관리자가 콘솔(CON-17, `bpm.center.consumers`)에서 다룬다. 이 폴더는 함께
배포되는 일꾼·시험·설치 스크립트의 **첫 설치**를 위한 길이다 — 배포가 `<이름>.consumer.json`(C15 `FolderConsumer` —
이름·토픽·**토큰 해시**)을 일꾼 폴더(`BPM_CENTER__CONSUMERS_DIR`, 기본 `<데이터>/consumers`)에 복사해 두면 여기서
들인다.

- **이미 있는 일꾼은 건드리지 않는다** — 같은 파일에서 들인 일꾼이 있으면 파일이 달라도 `unchanged`(다르면 그 뜻을
  단다). 같은 이름의 다른 일꾼이 있으면 `name_taken`으로 들이지 않는다.
- **파일이 빠져도 일꾼을 지우지 않는다.** 지우는 것은 콘솔이다. 콘솔에서 지운 일꾼의 파일이 남아도 되살아나지 않는다
  — 그 토큰은 폐기됐다(`token_revoked`).
- **잘못된 파일이 Center를 막지 않는다** — 사유는 로그와 `GET /resources/consumer-folder`(C7)로 간다.

같은 폴더의 `<이름>.key.json`(C7 `FolderKey`)은 **연동용·대리 답용 키**다 (ADR-0123) — 함께 설치되는 연동 시스템이
설치 때 원문을 짓고 Center에는 해시만 둔다. **키 파일은 여전히 폴더가 원본이다**(한 번 읽음·해시가 바뀌면 옛 키
폐기·폐기된 토큰은 되살아나지 않음·파일이 빠지면 폐기). 키의 자리는 `center_keys.folder_file`(파일 이름의
확장자 앞)이다.
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from bpm.center import keys
from bpm.center.api import external_tasks
from bpm.center.storage import Store, dumps, loads, now_iso
from bpm.contracts.center_keys import KEY_PREFIX, KEY_RANDOM_LEN, FolderKey
from bpm.contracts.external_task import CONSUMER, FolderConsumer
from bpm.contracts.resources import ConsumerFolderItem, ConsumerFolderScan

log = logging.getLogger(__name__)

SUFFIX = ".consumer.json"
#: 연동용·대리 답용 키 파일 (ADR-0123).
KEY_SUFFIX = ".key.json"
#: 폴더가 들인 일꾼의 「들인 쪽」(`consumers.approved_by`).
ACTOR = "일꾼 폴더"
#: 폴더가 들인 일꾼의 `machine_id` 머리 — 그 뒤는 파일 이름(확장자 앞)이다. `ConsumerInfo.source`가 이것으로 가른다.
MACHINE_PREFIX = external_tasks.FOLDER_MACHINE_PREFIX


def scan(store: Store, folder: Path | None, *, required: bool = True) -> ConsumerFolderScan:
    """폴더를 한 번 읽어 들인다. **예외를 밖으로 내지 않는다** — Center 기동을 막지 않는다.

    `required=False`(기본 자리)면 폴더가 없을 때 조용히 지나간다.
    """
    if folder is None or (not required and not folder.exists()):
        return ConsumerFolderScan(configured=False)
    at = now_iso()
    where = folder.as_posix()
    if not folder.is_dir():
        # 볼륨이 붙지 않은 것을 「다 뺐다」로 읽지 않는다 — 아무것도 바꾸지 않는다.
        problem = "폴더가 없습니다" if not folder.exists() else "폴더가 아닙니다"
        log.warning("일꾼 폴더 %s: %s", where, problem)
        return ConsumerFolderScan(configured=True, dir=where, scanned_at=at, problem=problem)

    items: list[ConsumerFolderItem] = []
    for path in sorted(folder.glob(f"*{SUFFIX}")):
        if not path.is_file():
            continue
        spec, why = _read(path)
        if spec is None:
            items.append(_refused(path, None, *why))
            continue
        try:
            items.append(_first_time(store, path.name[: -len(SUFFIX)], spec, file=path.name))
        except Exception as e:  # noqa: BLE001 — 한 파일이 Center를 막지 않는다
            log.exception("일꾼 폴더 %s를 들이다 터졌다", path.name)
            items.append(_refused(path, spec.name, "internal", f"들이다 오류가 났습니다: {type(e).__name__}"))
    items.extend(_scan_keys(store, folder))
    return ConsumerFolderScan(configured=True, dir=where, scanned_at=at, items=items)


def _first_time(store: Store, stem: str, spec: FolderConsumer, *, file: str) -> ConsumerFolderItem:
    """**처음 한 번만** 들인다 (ADR-0137) — 이미 들인 일꾼은 콘솔이 원본이라 파일의 값으로 되돌리지 않는다."""
    row = store.row("SELECT * FROM consumers WHERE machine_id = ?", (f"{MACHINE_PREFIX}{stem}",))
    if row is not None:
        held = store.row("SELECT key_hash FROM center_keys WHERE key_id = ?", (row["key_id"],))
        same = (
            row["name"] == spec.name
            and (loads(row["topics_json"], []) or []) == sorted(set(spec.topics))
            and held is not None
            and held["key_hash"] == spec.token_sha256
        )
        message = None if same else "이미 들인 일꾼입니다 — 파일의 바뀐 값은 들이지 않습니다. 콘솔에서 고치세요"
        return ConsumerFolderItem(file=file, id=spec.name, outcome="unchanged", message=message)
    if store.row("SELECT 1 FROM consumers WHERE name = ?", (spec.name,)) is not None:
        return _refused_at(file, spec.name, "name_taken", "같은 이름의 일꾼이 이미 있습니다 — 다른 이름으로 바꾸세요")
    return admit(store, stem, spec, file=file)


def admit(store: Store, stem: str, spec: FolderConsumer, *, file: str | None = None) -> ConsumerFolderItem:
    """일꾼 하나를 들인다(또는 파일 값으로 맞춘다). 폴더는 **없는 일꾼에만** 부르고(`_first_time`), 시험은 이것으로
    바로 들인다 (`tests/consumers.py`)."""
    machine_id = f"{MACHINE_PREFIX}{stem}"
    topics = sorted(set(spec.topics))
    manifests = [one.to_json_dict() for one in spec.manifests if one.app_id in topics]
    now = now_iso()
    row = store.row("SELECT * FROM consumers WHERE machine_id = ?", (machine_id,))
    key = keys.get(store, str(row["key_id"])) if row is not None else None
    held = store.row("SELECT key_id, revoked_at FROM center_keys WHERE key_hash = ?", (spec.token_sha256,))
    if held is not None and held["revoked_at"] is not None:
        # **폐기된 토큰은 되살아나지 않는다** — 바꾼 토큰이거나 파일에서 빠졌던 토큰이다.
        return _refused_at(file, spec.name, "token_revoked", "이 토큰은 폐기됐습니다 — 새 토큰으로 바꾸세요")
    same_key = key is not None and key.revoked_at is None and held is not None and held["key_id"] == key.key_id
    if held is not None and not same_key:
        return _refused_at(file, spec.name, "token_in_use", "이 토큰은 이미 다른 키가 씁니다")
    if (
        row is not None
        and same_key
        and row["name"] == spec.name
        and (loads(row["topics_json"], []) or []) == topics
        and (loads(row["manifest_json"], None) or []) == manifests
    ):
        return ConsumerFolderItem(file=file, id=spec.name, outcome="unchanged")

    with store.tx() as cur:
        key_id = key.key_id if same_key and key is not None else keys.new_key_id()
        if not same_key:
            if key is not None:
                cur.execute(
                    "UPDATE center_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL", (now, key.key_id)
                )
            # **앞자리가 비어 있다** — 원문을 모르니 해시로만 찾는다 (`keys.find`). 만료·공개키가 없어 회전하지 않는다.
            cur.execute(
                "INSERT INTO center_keys (key_id, name, type, prefix, key_hash, created_at, expires_at)"
                " VALUES (?, ?, ?, '', ?, ?, NULL)",
                (key_id, spec.name, CONSUMER, spec.token_sha256, now),
            )
        else:
            cur.execute("UPDATE center_keys SET name = ? WHERE key_id = ?", (spec.name, key_id))
        cur.execute(
            "INSERT INTO consumers (consumer_id, key_id, machine_id, name, topics_json, manifest_json,"
            " approved_at, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (consumer_id) DO UPDATE SET key_id = excluded.key_id, name = excluded.name,"
            " topics_json = excluded.topics_json, manifest_json = excluded.manifest_json",
            (
                str(row["consumer_id"]) if row is not None else f"csm_folder_{stem}",
                key_id,
                machine_id,
                spec.name,
                dumps(topics),
                dumps(manifests) if manifests else None,
                now,
                ACTOR,
            ),
        )
    log.info("일꾼 폴더 %s: 일꾼 %s를 들였다 (토픽 %s)", file or stem, spec.name, ", ".join(topics))
    return ConsumerFolderItem(file=file, id=spec.name, outcome="registered")


def _read(path: Path, model: type[Any] = FolderConsumer) -> tuple[Any, tuple[str, str]]:
    try:
        # Windows에서 저장한 파일의 BOM도 받는다.
        raw: Any = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, ValueError) as e:
        return None, ("unreadable", f"파일을 JSON으로 읽지 못했습니다: {e}")
    try:
        return model.model_validate(raw), ("", "")
    except ValidationError as e:
        first = e.errors()[0]
        where = ".".join(str(one) for one in first.get("loc", ())) or "(전체)"
        return None, ("input_invalid", f"{where}: {first.get('msg')}")


def _refused(path: Path, name: str | None, code: str, message: str, *, kind: str = "consumer") -> ConsumerFolderItem:
    return _refused_at(path.name, name, code, message, kind=kind)


def _refused_at(
    file: str | None, name: str | None, code: str, message: str, *, kind: str = "consumer"
) -> ConsumerFolderItem:
    log.warning("일꾼 폴더 %s를 들이지 않았다 (%s): %s", file, code, message)
    return ConsumerFolderItem(kind=kind, file=file, id=name, outcome="refused", code=code, message=message)


# ─────────────────────────── 연동용·대리 답용 키 (`<이름>.key.json`, ADR-0123) ───────────────────────────


def _scan_keys(store: Store, folder: Path) -> list[ConsumerFolderItem]:
    items: list[ConsumerFolderItem] = []
    present: set[str] = set()
    for path in sorted(folder.glob(f"*{KEY_SUFFIX}")):
        if not path.is_file():
            continue
        stem = path.name[: -len(KEY_SUFFIX)]
        # 읽지 못해도 자리는 남긴다 — 파일이 있는 한 그 키를 폐기하지 않는다.
        present.add(stem)
        spec, why = _read(path, FolderKey)
        if spec is None:
            items.append(_refused(path, None, *why, kind="key"))
            continue
        try:
            items.append(admit_key(store, stem, spec, file=path.name))
        except Exception as e:  # noqa: BLE001 — 한 파일이 Center를 막지 않는다
            log.exception("일꾼 폴더 %s를 들이다 터졌다", path.name)
            items.append(
                _refused(path, spec.name, "internal", f"들이다 오류가 났습니다: {type(e).__name__}", kind="key")
            )
    items.extend(_drop_missing_keys(store, present))
    return items


def admit_key(store: Store, stem: str, spec: FolderKey, *, file: str | None = None) -> ConsumerFolderItem:
    """키 하나를 들인다(또는 맞춘다). 권한은 CON-11에서 발급한 같은 종류의 키와 같다 — 종류가 권한이다."""
    row = store.row(
        "SELECT key_id, name, type FROM center_keys WHERE folder_file = ? AND revoked_at IS NULL", (stem,)
    )
    held = store.row("SELECT key_id, revoked_at FROM center_keys WHERE key_hash = ?", (spec.token_sha256,))
    if held is not None and held["revoked_at"] is not None:
        return _refused_at(
            file, spec.name, "token_revoked", "이 토큰은 폐기됐습니다 — 새 토큰으로 바꾸세요", kind="key"
        )
    same_key = row is not None and held is not None and held["key_id"] == row["key_id"]
    if held is not None and not same_key:
        return _refused_at(file, spec.name, "token_in_use", "이 토큰은 이미 다른 키가 씁니다", kind="key")
    if same_key and row is not None and row["name"] == spec.name and row["type"] == spec.type:
        return ConsumerFolderItem(kind="key", file=file, id=spec.name, outcome="unchanged")

    now = now_iso()
    with store.tx() as cur:
        if same_key and row is not None:
            cur.execute(
                "UPDATE center_keys SET name = ?, type = ? WHERE key_id = ?", (spec.name, spec.type, row["key_id"])
            )
        else:
            if row is not None:
                cur.execute(
                    "UPDATE center_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL",
                    (now, row["key_id"]),
                )
            # 일꾼 키처럼 **앞자리가 비어 있다** — 원문을 모르니 해시로만 찾는다 (`keys.find`).
            cur.execute(
                "INSERT INTO center_keys (key_id, name, type, prefix, key_hash, created_at, expires_at, folder_file)"
                " VALUES (?, ?, ?, '', ?, ?, NULL, ?)",
                (keys.new_key_id(), spec.name, spec.type, spec.token_sha256, now, stem),
            )
    log.info("일꾼 폴더 %s: %s 키 %s를 들였다", file or stem, spec.type, spec.name)
    return ConsumerFolderItem(kind="key", file=file, id=spec.name, outcome="registered")


def _drop_missing_keys(store: Store, present: set[str]) -> list[ConsumerFolderItem]:
    """파일이 빠진 키 — 폐기한다. 행은 남는다(CON-11에 「폐기됨」으로 보인다)."""
    out: list[ConsumerFolderItem] = []
    now = now_iso()
    for row in store.rows(
        "SELECT key_id, name, folder_file FROM center_keys WHERE folder_file IS NOT NULL AND revoked_at IS NULL"
    ):
        if str(row["folder_file"]) in present:
            continue
        with store.tx() as cur:
            cur.execute(
                "UPDATE center_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL", (now, row["key_id"])
            )
        log.info("일꾼 폴더: 파일이 빠져 키 %s를 폐기했다", row["name"])
        out.append(
            ConsumerFolderItem(
                kind="key", id=str(row["name"]), outcome="revoked", message="폴더에서 빠져 키를 폐기했습니다"
            )
        )
    return out


# ─────────────────────────── 파일 짓기 (`bpm-center consumer-file`) ───────────────────────────


def new_token() -> str:
    """일꾼 토큰 원문 — C7 키 모양(`bpm_ctr_` + 40자)이다. Center는 모양을 보지 않고 해시만 맞춘다."""
    return f"{KEY_PREFIX}{secrets.token_urlsafe(48)[:KEY_RANDOM_LEN]}"


def token_sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def write_key_file(folder: Path, name: str, key_type: str) -> tuple[Path, str]:
    """`<이름>.key.json`을 쓰고 `(파일, 토큰 원문)`을 돌려준다 (ADR-0123). 원문은 파일에 넣지 않는다."""
    raw = new_token()
    spec = FolderKey(name=name, type=key_type, token_sha256=token_sha256(raw))
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}{KEY_SUFFIX}"
    body = {"name": spec.name, "type": spec.type, "token_sha256": spec.token_sha256}
    path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path, raw


def write_file(folder: Path, name: str, topics: list[str]) -> tuple[Path, str]:
    """`<이름>.consumer.json`을 쓰고 `(파일, 토큰 원문)`을 돌려준다. 원문은 파일에 넣지 않는다."""
    raw = new_token()
    spec = FolderConsumer(name=name, topics=topics, token_sha256=token_sha256(raw))
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}{SUFFIX}"
    body = {"name": spec.name, "topics": spec.topics, "token_sha256": spec.token_sha256}
    path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path, raw
