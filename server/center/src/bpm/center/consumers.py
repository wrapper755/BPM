"""일꾼 관리 — Center 관리자가 콘솔(CON-17)에서 만들고, 종류·토픽을 바꾸고, 토큰을 새로 발급하고, 지운다.

C15 §일꾼 관리, ADR-0137. 종류(`ai`·`api`·`rpa`)는 가져가기가 거르는 값이다 (ADR-0139).

**원본은 DB다.** 일꾼의 요청은 그때마다 `consumers`·`center_keys`를 읽으므로 여기서 바꾼 것은 **다음 요청부터**
반영된다 — Center를 다시 띄우지 않는다. 일꾼 폴더(`consumer_folder`)는 없는 일꾼을 처음 한 번 들일 뿐이다.

- **토큰 원문은 만들기·새로 발급의 답에만 실린다.** Center는 해시만 둔다. 모양은 C7 키이고 만료·회전이 없다.
- 지우거나 토픽을 바꿔 **어느 일꾼의 토픽에도 없게 된 외부 확장**(일꾼이 올린 것)은 그 자리에서 철회한다.
- 쥔 일감은 손대지 않는다 — 잠금이 풀리면 다시 줄에 선다(`external_tasks.sweep`).
"""

from __future__ import annotations

import logging
import secrets
from typing import Any

from bpm.center import keys
from bpm.center.api import external_tasks, resources
from bpm.center.errors import ApiError
from bpm.center.storage import Store, dumps, loads, now_iso
from bpm.contracts.center_keys import prefix_of
from bpm.contracts.external_task import CONSUMER, ConsumerCreated, ConsumerInfo

log = logging.getLogger(__name__)

#: 콘솔에서 만든 일꾼의 `machine_id` 머리 — 그 뒤는 `consumer_id`다 (폴더 일꾼은 `folder:<파일 이름>`).
MACHINE_PREFIX = "console:"


def create(store: Store, *, name: str, topics: list[str], kinds: list[str] | None = None, by: str) -> ConsumerCreated:
    """일꾼 하나를 만든다 → 정보 + **토큰 원문**(이 답에만 있다). 같은 이름이 있으면 409 `name_taken`.
    `kinds`를 비우면 정하지 않은 일꾼이다 — 모든 종류를 가져간다."""
    name = name.strip()
    if not name:
        raise ApiError(422, "input_invalid", "이름이 비었다")
    if store.row("SELECT 1 FROM consumers WHERE name = ?", (name,)) is not None:
        raise ApiError(409, "name_taken", f"같은 이름의 일꾼이 이미 있다: {name}")
    consumer_id = f"csm_{secrets.token_hex(4)}"
    raw = keys.new_key()
    now = now_iso()
    with store.tx() as cur:
        key_id = _insert_key(cur, name, raw, now)
        cur.execute(
            "INSERT INTO consumers (consumer_id, key_id, machine_id, name, topics_json, kinds_json, manifest_json,"
            " approved_at, approved_by) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
            (
                consumer_id, key_id, f"{MACHINE_PREFIX}{consumer_id}", name, dumps(_topics(topics)),
                dumps(_kinds(kinds)) if kinds else None, now, by,
            ),
        )
    said = _said(kinds, "정하지 않음")
    log.info("일꾼 %s를 만들었다 (토픽 %s, 종류 %s, %s)", name, ", ".join(_topics(topics)), said, by)
    return _created(store, consumer_id, raw)


def update(
    store: Store, consumer_id: str, topics: list[str], *, kinds: list[str] | None = None, by: str
) -> ConsumerInfo:
    """맡는 토픽(과 `kinds`를 주면 종류)을 바꾼다. 빠진 토픽의 manifest는 버리고, 맡을 일꾼이 없어진 외부 확장은
    철회한다. `kinds`를 비우면 종류는 그대로다."""
    row = _row(store, consumer_id)
    wanted = _topics(topics)
    held = [one for one in external_tasks._held_manifests(row) if one.get("app_id") in wanted]
    kinds_json = dumps(_kinds(kinds)) if kinds else row["kinds_json"]
    with store.tx() as cur:
        cur.execute(
            "UPDATE consumers SET topics_json = ?, manifest_json = ?, kinds_json = ? WHERE consumer_id = ?",
            (dumps(wanted), dumps(held) if held else None, kinds_json, consumer_id),
        )
    log.info("일꾼 %s를 바꿨다: 토픽 %s, 종류 %s (%s)", row["name"], ", ".join(wanted), _said(kinds), by)
    revoke_orphans(store, by=by)
    return external_tasks.consumer_info(store, _row(store, consumer_id))


def reissue(store: Store, consumer_id: str, *, by: str) -> ConsumerCreated:
    """토큰을 새로 발급한다 → 새 원문. **옛 토큰은 바로 거부된다**(그 키를 폐기한다)."""
    row = _row(store, consumer_id)
    raw = keys.new_key()
    now = now_iso()
    with store.tx() as cur:
        cur.execute(
            "UPDATE center_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL", (now, row["key_id"])
        )
        key_id = _insert_key(cur, str(row["name"]), raw, now)
        cur.execute("UPDATE consumers SET key_id = ? WHERE consumer_id = ?", (key_id, consumer_id))
    log.info("일꾼 %s의 토큰을 새로 발급했다 — 옛 토큰은 폐기 (%s)", row["name"], by)
    return _created(store, consumer_id, raw)


def delete(store: Store, consumer_id: str, *, by: str) -> None:
    """지운다 — 토큰의 키를 폐기하고 행을 지운다. 맡을 일꾼이 없어진 외부 확장은 철회한다."""
    row = _row(store, consumer_id)
    with store.tx() as cur:
        cur.execute(
            "UPDATE center_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL",
            (now_iso(), row["key_id"]),
        )
        cur.execute("DELETE FROM consumers WHERE consumer_id = ?", (consumer_id,))
    log.info("일꾼 %s를 지웠다 (%s)", row["name"], by)
    revoke_orphans(store, by=by)


def revoke_orphans(store: Store, *, by: str) -> list[tuple[str, str]]:
    """일꾼이 올렸는데 이제 **어느 일꾼의 토픽에도 없는** 외부 확장 — 그 판들을 거둔다 (철회 봉투는 Center가 서명)."""
    topics: set[str] = set()
    for row in store.rows("SELECT topics_json FROM consumers"):
        topics |= set(loads(row["topics_json"], []) or [])
    revoked: list[tuple[str, str]] = []
    for row in store.rows(
        "SELECT id, version FROM extensions WHERE source = ? AND revoked_json IS NULL ORDER BY id, version",
        (external_tasks.EXTENSION_SOURCE,),
    ):
        ext_id, version = str(row["id"]), str(row["version"])
        if ext_id in topics:
            continue
        resources.revoke_extension(store, ext_id, version, reason="맡을 일꾼이 없어졌다", by=by)
        log.info("맡을 일꾼이 없어 외부 확장 %s@%s를 거뒀다 (%s)", ext_id, version, by)
        revoked.append((ext_id, version))
    return revoked


def _insert_key(cur: Any, name: str, raw: str, now: str) -> str:
    key_id = keys.new_key_id()
    # 만료·공개키가 없다 — 회전하지 않는다 (폴더 일꾼과 같다).
    cur.execute(
        "INSERT INTO center_keys (key_id, name, type, prefix, key_hash, created_at, expires_at)"
        " VALUES (?, ?, ?, ?, ?, ?, NULL)",
        (key_id, name, CONSUMER, prefix_of(raw), keys.key_hash(raw), now),
    )
    return key_id


def _created(store: Store, consumer_id: str, raw: str) -> ConsumerCreated:
    info = external_tasks.consumer_info(store, _row(store, consumer_id))
    return ConsumerCreated(**info.model_dump(), token=raw)


def _row(store: Store, consumer_id: str) -> Any:
    row = store.row("SELECT * FROM consumers WHERE consumer_id = ?", (consumer_id,))
    if row is None:
        raise ApiError(404, "not_found", f"일꾼 {consumer_id}가 없다")
    return row


def _topics(topics: list[str]) -> list[str]:
    return sorted(set(topics))


def _kinds(kinds: list[str]) -> list[str]:
    return resources.ordered_kinds(kinds)


def _said(kinds: list[str] | None, empty: str = "그대로") -> str:
    return ", ".join(_kinds(kinds)) if kinds else empty


__all__ = ["create", "delete", "reissue", "revoke_orphans", "update"]
