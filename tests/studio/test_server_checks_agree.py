"""「서버에서 할 수 없다」는 두 자리가 **같은 답**을 낸다 — 그림 검사 C14 B6 ↔ 패키지 검사 C1 R2.

둘은 같은 규칙을 **따로 적는다**: B6는 노드를 보고(`server_blockers`), R2는 Studio가 그림에서
모은 매니페스트를 본다(`requires.domains`). 한쪽에만 항목이 더해지면 「시험 실행은 되는데
올리기만 막힌다」가 된다.

실행 자리가 서버 하나가 되면서(ADR-0144) 남은 것은 **웹·데스크톱 AI 태스크**다 — 그 판은
아직 돌릴 수 없다 (ADR-0114). 업무 예제 전부와 **노드 하나짜리 그림들**로 견준다.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from bpm.contracts.bpmn_ext import server_blockers
from bpm.contracts.manifest import validate
from bpm.studio.dialogs import example_ids
from bpm.studio.packaging import build_manifest
from bpm.studio.workspace import BpmProcess, Workspace

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "08-business-examples" / "bpmn"


@pytest.fixture(scope="module")
def imported(tmp_path_factory: pytest.TempPathFactory) -> dict[str, BpmProcess]:
    space = Workspace(tmp_path_factory.mktemp("examples")).ensure()
    return {example: space.import_example(EXAMPLES, example) for example in example_ids(EXAMPLES)}


def _probe(node: str) -> str:
    """노드 하나를 시작·끝 사이에 둔 그림 (실행 위치는 적지 않는다 — 서버로 친다)."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpm="urn:chaeksas:bpmn:1" id="Defs_p" targetNamespace="urn:chaeksas:test">
  <bpmn:process id="Proc_p" name="probe" isExecutable="true">
    <bpmn:startEvent id="Start" />{node}<bpmn:endEvent id="End" />
    <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="N" />
    <bpmn:sequenceFlow id="F1" sourceRef="N" targetRef="End" />
  </bpmn:process>
</bpmn:definitions>"""


def _task(kind: str, ext: str) -> str:
    return f'<bpmn:{kind} id="N"><bpmn:extensionElements>{ext}</bpmn:extensionElements></bpmn:{kind}>'


def probes() -> dict[str, str]:
    """막히는 종류마다 하나, 막히지 않는 것도 섞는다."""
    found = {
        "확인": _task("manualTask", '<bpm:approval>{"title": "확인"}</bpm:approval>'),
        "결재": _task("userTask", '<bpm:approval>{"title": "결재"}</bpm:approval>'),
        "AI-web": _task("serviceTask", '<bpm:aiTask>{"goal": "x", "domain": "web"}</bpm:aiTask>'),
        "AI-desktop": _task("serviceTask", '<bpm:aiTask>{"goal": "x", "domain": "desktop"}</bpm:aiTask>'),
        "AI-도메인없음": _task("serviceTask", '<bpm:aiTask>{"goal": "x"}</bpm:aiTask>'),
    }
    return found


@pytest.fixture(scope="module")
def probed(tmp_path_factory: pytest.TempPathFactory) -> dict[str, BpmProcess]:
    root = tmp_path_factory.mktemp("probes")
    space = Workspace(root / "space").ensure()
    made = {}
    for index, (name, node) in enumerate(probes().items()):
        drawing = root / f"probe{index}.bpmn"
        drawing.write_text(_probe(node), encoding="utf-8")
        made[name] = space.create(f"probe-{index}", first=drawing)
    return made


def b6_says_no(process: BpmProcess) -> bool:
    """패키지에 들어가는 정의 어느 하나라도 서버에서 못 하는 것이 있나."""
    return any(
        server_blockers(found.process)
        for found in process.definitions
        if found.process is not None
    )


def r2_says_no(process: BpmProcess) -> bool:
    return any(v.rule == "R2" for v in validate(build_manifest(process)))


def answers(processes: dict[str, BpmProcess]) -> dict[str, dict[str, bool]]:
    return {
        name: {"B6": b6_says_no(process), "R2": r2_says_no(process)}
        for name, process in processes.items()
    }


def test_every_example_gets_the_same_answer_from_b6_and_r2(imported: dict[str, BpmProcess]) -> None:
    assert len(imported) >= 45, "예제를 찾지 못했다"
    apart = answers(imported)
    disagree = {example: both for example, both in apart.items() if both["B6"] != both["R2"]}
    assert not disagree, f"B6와 R2가 다르게 답한다: {disagree}"
    # 예제는 모두 서버에서 돈다 — 막히는 쪽은 아래 노드 하나짜리 그림이 지킨다.
    assert not any(both["B6"] for both in apart.values()), "서버에서 막히는 예제가 있다"


def test_each_kind_of_server_blocker_gets_the_same_answer(probed: dict[str, BpmProcess]) -> None:
    apart = answers(probed)
    disagree = {name: both for name, both in apart.items() if both["B6"] != both["R2"]}
    assert not disagree, f"B6와 R2가 다르게 답한다: {disagree}"
    # 그림이 뜻대로 지어졌나 — 막혀야 할 것은 막히고 아닌 것은 지난다.
    for name in ("AI-web", "AI-desktop"):
        assert apart[name]["B6"], name
    for name in ("확인", "결재", "AI-도메인없음"):
        assert not apart[name]["B6"], name
