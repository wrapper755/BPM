"""C14 `bpm:*` 요소에서 짓는 것 — bpmn-moddle 설명과 **속성 폼 명세**.

실행: `uv run python scripts/gen_moddle.py`
`--check`: 파일을 쓰지 않고 검사만 하며, 생성물이 모델과 다르면 1로 끝난다 (CI용).

bpmn-js가 우리 확장 요소를 **타입으로** 다루려면 설명이 필요하다. **손으로 쓰지 않는다** —
원본은 `contracts.bpmn_ext.ELEMENT_MODELS`이고, `bpm:*`를 하나 더하면 여기를 다시 돌려야 CI가
통과한다.

**자리가 둘이다** (ADR-0143):

- 콘솔 웹 편집기의 캔버스: `server/web/packages/bpmn-canvas/src/moddle.ts` (ES 모듈)
- 속성 폼: `server/web/packages/bpmn-canvas/src/element-forms.ts` — CON-20 상세 패널이 **폼을 손으로
  쓰지 않게** 한다. 칸 이름·타입·필수 여부가 모델에서 오므로 `bpm:*`에 칸을 더하면 폼에 저절로 생긴다.

속성 **본문은 JSON 텍스트 하나**다 (C14 기본 규칙 2) — 그래서 요소마다 `isBody` 속성 하나이고,
XML 속성을 따로 쓰는 것은 `bpm:task`의 `type`·`extension`뿐이다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from bpm.contracts.bpmn_ext import BPM_NS, ELEMENT_MODELS
from bpm.contracts.manifest import KNOWN_DOMAINS
from bpm.contracts.replay import REPLAY_MODES

# Windows 콘솔·파이프의 기본 코드페이지(cp949·cp1252)에서는 한글을 찍다 터진다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "server" / "web" / "packages" / "bpmn-canvas" / "src" / "moddle.ts"
FORMS = ROOT / "server" / "web" / "packages" / "bpmn-canvas" / "src" / "element-forms.ts"

#: XML 속성으로 적는 것 (나머지는 전부 본문 JSON이다). C14 §태스크 종류 표의 `bpm:task`.
XML_ATTRIBUTES: dict[str, tuple[str, ...]] = {"task": ("type", "extension")}

#: 요소의 **화면 이름** — 모델에는 한글이 없다. 데스크톱 Studio의 탭 이름을 그대로 옮겨 왔다.
#: 빠진 것이 있으면 아래에서 **멈춘다** — 이름 없는 폼이 조용히 생기지 않게.
ELEMENT_LABELS: dict[str, str] = {
    "process": "프로세스",
    "defaults": "기본값",
    "aiTask": "AI 태스크",
    "task": "확장 태스크",
    "serviceCall": "서비스 앱",
    "approval": "결재",
    "rule": "규칙",
    "email": "메일",
    "webhook": "웹훅",
    "receive": "받기",
    "call": "호출",
    "loop": "반복",
    "dataOutput": "파일 출력",
    "fileList": "파일 목록",
}

#: 칸의 **화면 이름**과 짧은 설명 — 요소 이름과 같은 까닭으로 여기 둔다(모델에는 한글이 없다).
#: 폼은 한글 이름 옆에 원문 칸 이름을 옅게 붙인다(CON-20b 상세 패널). 빠진 칸이 있으면 **멈춘다**.
FIELD_LABELS: dict[tuple[str, str], tuple[str, str | None]] = {
    ("aiTask", "goal"): ("목표", "AI가 이 태스크에서 이룰 것을 한 문장으로 적습니다."),
    ("aiTask", "domain"): ("영역", None),
    ("aiTask", "tools"): ("허용 도구", "쓸 수 있는 도구 이름입니다."),
    ("aiTask", "params"): ("매개변수", "재생 때 `$param`으로 바뀌는 값입니다."),
    ("aiTask", "results"): ("결과 필드", "`이름=타입` — AI가 채워 돌려줄 칸입니다."),
    ("aiTask", "replay"): ("재생", "full: 모델 0회 · plan: 마지막 추출만 모델 · none: 매번 자율."),
    ("aiTask", "limits"): ("한도", None),
    ("aiTask", "forbidden_actions"): ("금지 동작", None),
    ("aiTask", "confirm_triggers"): ("확인할 때", "이 말이 걸리면 사람에게 확인을 받습니다."),
    ("aiTask", "web"): ("웹 설정", None),
    ("aiTask", "desktop"): ("데스크톱 설정", None),
    ("approval", "title"): ("제목", None),
    ("approval", "description"): ("설명", None),
    ("approval", "show"): ("보일 값", "결재하는 사람에게 보일 변수입니다."),
    ("approval", "fields"): ("답 칸", None),
    ("approval", "expires"): ("기한", "ISO 기간(`P3D`) 또는 변수 이름입니다."),
    ("approval", "assignees"): ("담당자", None),
    ("approval", "answered_by_as"): ("답한 사람 변수", "답한 사람을 담을 변수입니다."),
    ("approval", "answered_via_as"): ("답한 길 변수", "답이 들어온 길을 담을 변수입니다."),
    ("call", "input"): ("입력", "`호출 대상 변수=식`"),
    ("call", "output"): ("출력", "`내 변수=호출 대상 변수`"),
    ("call", "delegate"): ("맡기기", "켜면 따로 실행으로 맡깁니다 (일괄 기동)."),
    ("dataOutput", "path"): ("경로", None),
    ("dataOutput", "format"): ("형식", None),
    ("dataOutput", "template"): ("템플릿", None),
    ("dataOutput", "variables"): ("변수", None),
    ("dataOutput", "sheet"): ("시트", None),
    ("dataOutput", "append"): ("이어 쓰기", None),
    ("dataOutput", "store_as"): ("경로를 담을 변수", None),
    ("defaults", "limits"): ("한도", None),
    ("defaults", "forbidden_actions"): ("금지 동작", None),
    ("defaults", "confirm_triggers"): ("확인할 때", None),
    ("defaults", "web"): ("웹 설정", None),
    ("defaults", "desktop"): ("데스크톱 설정", None),
    ("email", "to"): ("받는 사람", None),
    ("email", "cc"): ("참조", None),
    ("email", "subject"): ("제목", None),
    ("email", "body"): ("본문", None),
    ("email", "attachments"): ("첨부", "파일 경로가 든 변수 이름입니다."),
    ("email", "store_as"): ("결과를 담을 변수", None),
    ("fileList", "folder"): ("폴더", "`{변수}`를 쓸 수 있습니다. 상대 경로는 출력 폴더 기준입니다."),
    ("fileList", "pattern"): ("파일 이름 패턴", "glob 한 조각(`*.pdf`) — 경로 구분자는 쓸 수 없습니다."),
    ("fileList", "recursive"): ("하위 폴더까지", None),
    ("fileList", "sort"): ("정렬", None),
    ("fileList", "limit"): ("최대 개수", None),
    ("fileList", "store_as"): ("목록을 담을 변수", None),
    ("fileList", "count_as"): ("개수를 담을 변수", None),
    ("loop", "collection"): ("돌 목록", None),
    ("loop", "item"): ("항목 변수", None),
    ("loop", "result"): ("한 번의 결과", "한 번 돈 결과로 쓰는 변수 — 그 태스크의 출력 중 하나입니다."),
    ("loop", "collect_into"): ("모을 변수", "한 번의 결과를 모은 목록입니다."),
    ("process", "extensions"): ("확장", None),
    ("process", "inputs"): ("입력", None),
    ("process", "outputs"): ("출력", None),
    ("receive", "correlation"): ("상관 변수", "이 변수의 값이 같은 메시지만 받습니다."),
    ("receive", "payload"): ("받을 값", "본문에서 변수로 들어오는 이름입니다."),
    ("rule", "decision"): ("결정", "같은 패키지의 DMN 결정 id입니다."),
    ("rule", "input"): ("입력", "`DMN 입력 이름=식`"),
    ("rule", "output"): ("출력", "`변수=DMN 출력 이름`"),
    ("serviceCall", "app_id"): ("앱", None),
    ("serviceCall", "operation"): ("작업", None),
    ("serviceCall", "input"): ("입력", "`필드=식`"),
    ("serviceCall", "output"): ("출력", "`변수=필드`"),
    ("serviceCall", "timeout_s"): ("제한 시간(초)", None),
    ("serviceCall", "retry"): ("다시 시도", None),
    ("task", "type"): ("태스크 종류", "확장이 기여한 태스크 종류 id입니다."),
    ("task", "extension"): ("확장", "확장 id입니다."),
    ("task", "data"): ("데이터", None),
    ("webhook", "url"): ("주소", None),
    ("webhook", "method"): ("메서드", None),
    ("webhook", "body"): ("본문", "`all` · `fields:[…]` · `template:\"…\"`"),
    ("webhook", "timeout_s"): ("제한 시간(초)", None),
    ("webhook", "store_as"): ("결과를 담을 변수", None),
}

#: 모델에 적히지 않은 고를 거리 — 값은 **계약의 상수**에서 온다 (손으로 적지 않는다).
#: 모델이 `str`이고 허용 집합은 `validate()`가 보기 때문에 JSON Schema에 enum이 없다.
ELEMENT_CHOICES: dict[tuple[str, str], tuple[str, ...]] = {
    ("aiTask", "domain"): tuple(sorted(KNOWN_DOMAINS)),
    # **정렬한다** — 집합이라 돌릴 때마다 차례가 달라져 생성물이 흔들린다 (`--check`가 깨졌다).
    ("aiTask", "replay"): tuple(sorted(REPLAY_MODES)),
}

BANNER = (
    "// 생성 파일: C14 모델(`contracts.bpmn_ext.ELEMENT_MODELS`)에서 만든다.\n"
    "// 직접 고치지 말고 `uv run python scripts/gen_moddle.py` (ADR-0022).\n"
)


def descriptor() -> dict[str, object]:
    """bpmn-moddle이 읽는 설명 한 벌."""
    types = []
    for name in sorted(ELEMENT_MODELS):
        properties: list[dict[str, object]] = [{"name": "value", "type": "String", "isBody": True}]
        properties += [
            {"name": attribute, "type": "String", "isAttr": True}
            for attribute in XML_ATTRIBUTES.get(name, ())
        ]
        types.append(
            {
                # moddle 타입 이름은 대문자로 시작한다. `tagAlias: lowerCase`가 `bpm:aiTask`로 되돌린다.
                "name": name[0].upper() + name[1:],
                "superClass": ["Element"],
                "properties": properties,
            }
        )
    return {
        "name": "BPM",
        "uri": BPM_NS,
        "prefix": "bpm",
        "xml": {"tagAlias": "lowerCase"},
        "types": types,
    }


#: 폼이 그릴 줄 아는 칸의 갈래. 여기 없는 모양(안쪽 모델·섞인 목록)은 전부 `json`이고
#: 폼이 **JSON 칸 하나**로 보인다 — 칸이 조용히 빠지는 것보다 낫다.
def _kind_of(spec: dict[str, Any]) -> str:
    """JSON Schema 한 칸 → 폼이 그릴 갈래."""
    # `X | None`은 `anyOf`로 온다 — null을 빼고 하나 남으면 그것으로 본다.
    choices = [one for one in spec.get("anyOf", []) if one.get("type") != "null"]
    if len(choices) == 1:
        spec = choices[0]
    kind = spec.get("type")
    if kind == "boolean":
        return "bool"
    if kind in ("integer", "number"):
        return "number"
    if kind == "string":
        return "text"
    items = spec.get("items")
    if kind == "array" and isinstance(items, dict) and items.get("type") == "string":
        return "list-text"
    # `dict[str, Any]`는 `additionalProperties: true`(불리언)로 온다 — 값이 글만은 아니라 JSON이다.
    values = spec.get("additionalProperties")
    if kind == "object" and isinstance(values, dict) and values.get("type") == "string":
        return "map-text"
    return "json"


def forms() -> dict[str, object]:
    """요소마다 폼 한 벌 — 칸 이름·갈래·필수 여부가 **모델에서** 온다."""
    missing = sorted(set(ELEMENT_MODELS) - set(ELEMENT_LABELS))
    if missing:
        # 이름 없는 폼이 조용히 생기지 않게 **멈춘다** (생성기가 거짓말을 하지 않는다).
        raise SystemExit(f"화면 이름이 없는 요소: {', '.join(missing)} — ELEMENT_LABELS에 더한다")
    unnamed = sorted(
        f"{name}.{field}"
        for name, model in ELEMENT_MODELS.items()
        for field in model.model_fields
        if field != "schema" and (name, field) not in FIELD_LABELS
    )
    if unnamed:
        raise SystemExit(f"화면 이름이 없는 칸: {', '.join(unnamed)} — FIELD_LABELS에 더한다")
    out: dict[str, object] = {}
    for name in sorted(ELEMENT_MODELS):
        schema = ELEMENT_MODELS[name].model_json_schema()
        required = set(schema.get("required", []))
        fields = []
        for field_name, spec in schema.get("properties", {}).items():
            # `schema` 칸은 계약 번호라 사람이 고치지 않는다 (C14 — 모델이 채운다).
            if field_name == "schema":
                continue
            label, help_text = FIELD_LABELS[(name, field_name)]
            field: dict[str, object] = {
                "name": field_name,
                "label": label,
                "kind": _kind_of(spec),
                "required": field_name in required,
            }
            choices = ELEMENT_CHOICES.get((name, field_name))
            if choices:
                field["kind"] = "choice"
                field["choices"] = list(choices)
            help_text = spec.get("description") or help_text
            if help_text:
                field["help"] = help_text
            fields.append(field)
        out[name] = {"label": ELEMENT_LABELS[name], "fields": fields}
    return out


def rendered() -> dict[Path, str]:
    """자리마다 쓸 글 — 같은 설명이고 내보내는 꼴만 다르다."""
    body = json.dumps(descriptor(), ensure_ascii=False, indent=2)
    forms_body = json.dumps(forms(), ensure_ascii=False, indent=2)
    return {
        WEB: f"{BANNER}export const BPM_MODDLE = {body};\n",
        FORMS: (
            f"{BANNER}"
            "\n"
            "/** 폼이 그릴 줄 아는 칸의 갈래. `json`은 **그리지 못하는 모양**이라 JSON 칸 하나로 보인다. */\n"
            'export type FieldKind = "text" | "number" | "bool" | "choice" | "list-text" | "map-text" | "json";\n'
            "\n"
            "export interface ElementField {\n"
            "  name: string;\n"
            "  /** 화면 이름 (한글). 원문 칸 이름은 `name`이다. */\n"
            "  label: string;\n"
            "  kind: FieldKind;\n"
            "  required: boolean;\n"
            "  choices?: string[];\n"
            "  help?: string;\n"
            "}\n"
            "\n"
            "export interface ElementForm {\n"
            "  /** 화면 이름 (데스크톱 Studio의 탭 이름 그대로). */\n"
            "  label: string;\n"
            "  fields: ElementField[];\n"
            "}\n"
            "\n"
            "/** `bpm:*` 요소 이름 → 그 폼. 모델에 칸을 더하면 여기 저절로 생긴다. */\n"
            f"export const ELEMENT_FORMS: Record<string, ElementForm> = {forms_body};\n"
        ),
    }


def main() -> int:
    wanted = rendered()
    if "--check" in sys.argv:
        stale = [
            path
            for path, text in wanted.items()
            if not path.exists() or path.read_text(encoding="utf-8") != text
        ]
        for path in stale:
            print("다름:", path.relative_to(ROOT).as_posix())
        if stale:
            return 1
        print(f"bpm: 요소 {len(ELEMENT_MODELS)}개 설명 {len(wanted)}곳이 최신이다.")
        return 0

    for path, text in wanted.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"bpm: 요소 {len(ELEMENT_MODELS)}개 → {path.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
