"""C17 결정표 — 격자로 읽고 **결정표 하나만** 바꿔 쓴다 (ADR-0148).

**브라우저는 DMN을 해석하지 않는다.** 칸 문법이 두 벌이 되면 편집기가 받아 준 칸을 엔진이
거부하고, 그 차이는 돌려 봐야 드러난다. 그래서 읽고 쓰는 일은 `contracts.dmn_table` 하나이고
(엔진이 판정에 쓰는 `contracts.dmn` 바로 옆이다) Center가 그것을 부른다.

**받은 격자를 지금 파일 위에 얹는다** — id가 같은 열·줄은 **원래 요소를 그대로** 써서 모르는
속성·자식(열의 `inputValues`, 줄의 `annotationEntry`, 확장 요소)이 살아남는다. 보내지 않은 것을
지어내지 않는 길이다.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import ValidationError

from bpm.center import workspaces
from bpm.center.errors import ApiError
from bpm.center.storage import Store
from bpm.contracts import dmn_table
from bpm.contracts.dmn import DmnReadError
from bpm.contracts.workspace import (
    DecisionInputInfo,
    DecisionOutputInfo,
    DecisionRuleInfo,
    DecisionSaveRequest,
    DecisionSaveResponse,
    DecisionsResponse,
    DecisionTableInfo,
)


def _as_info(table: dmn_table.Table) -> DecisionTableInfo:
    return DecisionTableInfo(
        id=table.id,
        name=table.name,
        hit=table.hit,
        inputs=[
            DecisionInputInfo(id=one.id, expression=one.expression, label=one.label, type=one.type)
            for one in table.inputs
        ],
        outputs=[DecisionOutputInfo(id=one.id, name=one.name, type=one.type) for one in table.outputs],
        rules=[
            DecisionRuleInfo(
                id=one.id, cells=list(one.cells), values=list(one.values), description=one.description
            )
            for one in table.rules
        ],
    )


def _as_table(info: DecisionTableInfo, old: dmn_table.Table | None) -> dmn_table.Table:
    """격자 JSON → `Table`. **원래 요소는 id로 찾아 그대로 가져온다.**"""
    inputs = {one.id: one for one in (old.inputs if old else [])}
    outputs = {one.id: one for one in (old.outputs if old else [])}
    rules = {one.id: one for one in (old.rules if old else [])}
    return dmn_table.Table(
        id=info.id,
        name=info.name,
        hit=info.hit,
        inputs=[
            dmn_table.InputColumn(
                id=one.id,
                expression=one.expression,
                label=one.label,
                type=one.type,
                origin=inputs[one.id].origin if one.id in inputs else None,
            )
            for one in info.inputs
        ],
        outputs=[
            dmn_table.OutputColumn(
                id=one.id,
                name=one.name,
                type=one.type,
                origin=outputs[one.id].origin if one.id in outputs else None,
            )
            for one in info.outputs
        ],
        rules=[
            dmn_table.Row(
                id=one.id,
                cells=list(one.cells),
                values=list(one.values),
                description=one.description,
                entries=dict(rules[one.id].entries) if one.id in rules else {},
                origin=rules[one.id].origin if one.id in rules else None,
            )
            for one in info.rules
        ],
    )


def _tables(data: bytes, path: str) -> dict[str, dmn_table.Table]:
    try:
        return dmn_table.read_tables(data.decode("utf-8"))
    except (dmn_table.DmnTableError, DmnReadError, UnicodeDecodeError) as cause:
        raise ApiError(422, "bad_table", f"결정표를 읽지 못했다 ({path}): {cause}") from cause


def read(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    path: str,
    company: str | None,
) -> DecisionsResponse:
    """그 `.dmn`의 결정표들. 결정표가 아닌 결정은 **격자로 그릴 것이 없어** 오지 않는다."""
    data, revision = workspaces.read_file(
        store,
        workspace_dir=workspace_dir,
        workspace_id=workspace_id,
        path=path,
        company=company,
    )
    found = _tables(data, path)
    return DecisionsResponse(
        tables=[_as_info(found[key]) for key in sorted(found)],
        revision=revision,
    )


def save(
    store: Store,
    *,
    workspace_dir: Path,
    workspace_id: str,
    path: str,
    body: dict[str, Any],
    if_match: str | None,
    actor: str,
    company: str | None,
) -> DecisionSaveResponse:
    """결정표 하나를 바꿔 쓴다. **막는 흠이 있으면 아무것도 쓰지 않는다** (422 `bad_table`)."""
    try:
        request = DecisionSaveRequest.model_validate({"schema": 1, **body})
    except ValidationError as e:
        raise ApiError(422, "input_invalid", "요청이 계약과 맞지 않는다", {"errors": e.errors()}) from e
    data, _ = workspaces.read_file(
        store,
        workspace_dir=workspace_dir,
        workspace_id=workspace_id,
        path=path,
        company=company,
    )
    xml = data.decode("utf-8")
    old = _tables(data, path)
    wanted = request.original_id or request.table.id
    table = _as_table(request.table, old.get(wanted))

    # 새 결정이면 같은 파일의 다른 id와 겹치지 않아야 한다.
    taken = [key for key in old if key != wanted]
    errors, warnings = dmn_table.problems(table, taken=taken)
    if errors:
        raise ApiError(422, "bad_table", "결정표에 고칠 것이 있다: " + " / ".join(errors))

    try:
        made = dmn_table.write_table(xml, table, original_id=wanted)
    except (dmn_table.DmnTableError, DmnReadError) as cause:
        raise ApiError(422, "bad_table", f"결정표를 쓰지 못했다: {cause}") from cause

    info, _ = workspaces.write_file(
        store,
        workspace_dir=workspace_dir,
        workspace_id=workspace_id,
        path=path,
        data=made.encode("utf-8"),
        if_match=if_match,
        actor=actor,
        company=company,
    )
    return DecisionSaveResponse(revision=info.revision, warnings=warnings)
