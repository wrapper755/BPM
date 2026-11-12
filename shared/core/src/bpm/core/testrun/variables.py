"""그림이 말하는 변수 이름 — 그림에서 읽기만 한다 (C14 `bpm:process.inputs`·`outputs`).

케이스(`cases.py`)가 「기대 결과」의 고를 거리를 짓는 데 쓰고, 설계 화면도 같은 함수를 쓴다.
**고를 거리를 두 곳에서 지으면 화면마다 다른 이름이 보인다.**
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from bpm.contracts.bpmn_ext import BpmnProcess, ProcessInfo, produced_vars


def made_by(process: BpmnProcess) -> dict[str, list[str]]:
    """그림이 만드는 변수 → 만드는 노드(이름, 없으면 id). **계약의 `produced_vars`** 그대로다.

    검사(B11)와 같은 함수라 「여기는 있다는데 검사는 모른다」가 생기지 않는다.
    """
    out: dict[str, list[str]] = {}
    for node in process.all_nodes():
        for name in sorted(produced_vars(node)):
            out.setdefault(name, []).append(node.name or node.id)
    return out


def known_names(info: ProcessInfo | None, made: Mapping[str, Sequence[str]]) -> list[str]:
    """다른 화면의 고를 거리 — 출력, 그다음 그림이 만드는 변수, 그다음 입력 (겹치면 한 번).

    시험 케이스의 「기대 결과」가 이 차례로 보인다 — 비교하는 것은 대개 출력이다.
    """
    names: list[str] = []
    if info is not None:
        names += list(info.outputs)
    names += sorted(made)
    if info is not None:
        names += [decl.name for decl in info.inputs]
    return list(dict.fromkeys(name for name in names if name))


__all__ = ["known_names", "made_by"]
