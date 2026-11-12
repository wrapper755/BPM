"""실행 전 검사 — **지금 돌릴 수 있나**를 한 모양(`Violation`)으로 모은다.

출처가 **셋**이고 여기서 이어 붙인다. 보여 주는 쪽이 한 모양만 다루게 하려고 여기서 모으는 것이다.

| 무엇 | 어디서 | 왜 따로인가 |
| --- | --- | --- |
| C14 B1~B16 (그림) | `contracts.bpmn_ext.validate` | 형식 검사라 계약 쪽이다 |
| C14 B15 (도우미 호출 모양) | `core.expr_check` | 도우미의 인자 모양을 아는 것은 구현뿐이다 |
| **사전 점검** (여기서 돌 수 있나) | `core.preflight` | 확장·설정은 **그림이 아니라 이 자리**의 일이다 |

`validate()`는 계약 쪽에 있고 여기서는 **모으는 일만** 한다. 오류와 경고를 **함께** 내고
(`Violation.severity`), **오류만 실행을 막는다** — 경고는 보여 주고 사람이 판단한다 (C14 §검사 규칙).

**혼자서는 할 수 없는 검사는 인자로 받는다** — DMN 결정과 호출 대상은 작업 폴더가 주고,
맡긴 것이 받을 값과 어느 확장이 외부인가는 **Center를 읽은 쪽**이 준다. 여기서는 서버를 부르지 않는다.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Mapping, Sequence

from bpm.contracts import SEVERITY_ERROR, SEVERITY_WARNING, Violation
from bpm.contracts.bpmn_ext import BpmnProcess
from bpm.contracts.bpmn_ext import validate as validate_bpmn
from bpm.core import preflight as platform
from bpm.core.expr_check import check_expressions
from bpm.core.extensions import ExtensionHost
from bpm.core.testrun.workspace import BpmProcess
from bpm.extension_api import SEVERITY_BLOCK, ExtensionContext

CLEAN = "실행 전 검사: 막는 것도 경고도 없습니다."

#: 사전 점검 결과의 「규칙」 칸. B 규칙과 **한눈에 갈라** 보이게 — 그림의 흠이 아니라 이 자리의 일이다.
PREFLIGHT_RULE = "사전 점검"

#: 저장하지 않은 편집이 있을 때. 사전 점검은 **저장된 파일**에서 요구 사항을 모은다.
UNSAVED = (
    "저장하지 않은 편집이 있어 사전 점검은 **저장된 내용**으로 했습니다 — "
    "방금 더한 서비스 앱·키 참조는 세지 않았습니다"
)


def inspect(
    process: BpmnProcess,
    owner: BpmProcess | None = None,
    *,
    delegated_outputs: Mapping[str, Sequence[str]] | None = None,
) -> list[Violation]:
    """B1~B16. 작업 폴더가 있으면 DMN·호출 대조까지 한다 (B14).

    `delegated_outputs`는 **맡기는 BPM 프로세스가 선언한 `outputs`**다 (C1) — 남의 패키지
    매니페스트라 작업 폴더에 없고 **Center만 안다**. 받아 둔 것을 **부르는 쪽이** 넘긴다
    (이 모듈은 서버를 부르지 않는다). 주지 않거나 비어 있으면 B14가 그 대조를 건너뛴다 —
    **모르는 것으로 막지 않는다.**
    """
    if owner is None:
        violations = validate_bpmn(process, delegated_outputs=delegated_outputs or None)
    else:
        violations = validate_bpmn(
            process,
            dmn_decisions={decision_id: found.io for decision_id, found in owner.decisions().items()},
            called_processes={
                other.id: list(other.info.outputs) for other in owner.processes().values()
            },
            # **빈 사전은 주지 않는다** — 「아무 BPM 프로세스도 아무것도 선언하지 않았다」가 되어
            # 멀쩡한 맡기기가 모두 막힌다. 못 받았으면 `None`이고 그러면 건너뛴다.
            delegated_outputs=delegated_outputs or None,
        )
    return violations + check_expressions(process)


def readiness(
    owner: BpmProcess,
    *,
    host: ExtensionHost | None = None,
    context: Callable[[str], ExtensionContext] | None = None,
    dirty: bool = False,
    external_ids: Collection[str] = (),
) -> list[Violation]:
    """사전 점검 — **여기서 지금 돌릴 수 있나** (`core.preflight`, ADR-0013).

    서버 실행기와 **같은 점검**이다 — 갖춰야 할 설정·확장 태스크 종류와 확장이 기여한 점검(C13).
    결과를 `Violation`으로 옮겨 보여 주는 쪽이 한 모양만 다루게 한다.

    요구 사항은 **저장된 파일**에서 모은다 (`packaging.collect_requires`가 작업 폴더를 읽는다).
    그래서 `dirty`면 그렇게 말해 준다 — 방금 더한 태스크의 요구를 「없다」고 하거나, 방금 지운 것을
    「있다」고 하면 사람이 엉뚱한 데를 고친다.

    **그림을 읽지 못하면 조용히 통과시키지 않는다** — 점검할 수 없었다고 경고로 남긴다.

    `external_ids`는 **어느 확장이 외부인가**다 (ADR-0060의 고정 경고에 쓴다). **부르는 쪽이
    준다** — 외부 확장은 여기 깔리지 않아 호스트가 모르고(`host.get()`이 `None`이다),
    점검은 **서버를 부르지 않는다**. 받아 둔 리소스 목록(C7)에서 넘긴다. 주지 않으면
    **그 경고를 하지 않는다** — 모르는 것으로 경고를 지어내지 않는다.
    """
    from bpm.core.testrun.packaging import PackageError, build_manifest  # noqa: PLC0415 - 순환 피함

    out = []
    if dirty:
        out.append(Violation(rule=PREFLIGHT_RULE, code="unsaved", message=UNSAVED, severity=SEVERITY_WARNING))
    try:
        manifest = build_manifest(
            owner, key_extensions=None if host is None else host.key_extensions()
        )
    except (PackageError, AssertionError, ValueError) as e:
        # 시작 정의가 없거나 읽히지 않는다 — B 규칙이 이미 말하고 있을 것이다. 덮어쓰지 않는다.
        out.append(
            Violation(
                rule=PREFLIGHT_RULE,
                code="manifest_unavailable",
                message=f"사전 점검을 하지 못했습니다 — 요구 사항을 모을 수 없습니다 ({e})",
                severity=SEVERITY_WARNING,
            )
        )
        return out

    found = platform.check(manifest, host=host, context=context)
    for finding in found.findings:
        hint = f" ({finding.fix_hint})" if finding.fix_hint else ""
        out.append(
            Violation(
                rule=PREFLIGHT_RULE,
                code=finding.id,
                message=f"{finding.message}{hint}",
                items=list(finding.items),
                severity=SEVERITY_ERROR if finding.severity == SEVERITY_BLOCK else SEVERITY_WARNING,
            )
        )
    # **고정하지 않은 외부 확장은 경고다** (ADR-0060 §3) — 막지 않는다. 막으면 사람이 뒷문을
    # 요구하고 그 뒷문이 기본값이 된다. 「덜 조인 것」이라 C14 검사(B…)를 늘리지도 않는다.
    unpinned = [
        f"{need.id} ({need.version})"
        for need in manifest.requires.extensions
        if not need.definition_hash and need.id in set(external_ids)
    ]
    if unpinned:
        out.append(
            Violation(
                rule=PREFLIGHT_RULE,
                code="definition_unpinned",
                message=(
                    f"외부 확장 {len(unpinned)}개가 고정되지 않았습니다 — 정의가 바뀌어도 "
                    "그대로 돕니다 (STU-15 「정의 고정」)"
                ),
                items=unpinned,
                severity=SEVERITY_WARNING,
            )
        )
    # 돌리지 못한 점검도 보인다 — 숨기면 「점검했는데 아무 말이 없었다」가 된다 (점검은 막지 않는다).
    for why in found.skipped:
        out.append(
            Violation(
                rule=PREFLIGHT_RULE,
                code="check_skipped",
                message=f"확장의 점검 하나를 돌리지 못했습니다 — {why}",
                severity=SEVERITY_WARNING,
            )
        )
    return out


def summarize(violations: Sequence[Violation]) -> str:
    """상태 줄 한 줄. **오류만 실행을 막는다.**"""
    errors = sum(1 for v in violations if v.severity == SEVERITY_ERROR)
    warnings = len(violations) - errors
    if not violations:
        return CLEAN
    return f"실행 전 검사: 막는 것 {errors}개, 경고 {warnings}개"


def node_of(process: BpmnProcess, violation: Violation) -> str:
    """위반이 가리키는 노드 id (캔버스로 뛰어가려고). 못 찾으면 빈 글."""
    known = {n.id for n in process.all_nodes()}
    for item in violation.items:
        head = str(item).split(":")[0].strip()
        if head in known:
            return head
    for word in str(violation.message).replace(":", " ").replace(",", " ").split():
        if word.strip("`의가는이") in known:
            return word.strip("`의가는이")
        if word in known:
            return word
    return ""


__all__ = [
    "CLEAN",
    "PREFLIGHT_RULE",
    "UNSAVED",
    "inspect",
    "node_of",
    "readiness",
    "summarize",
]
