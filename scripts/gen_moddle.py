"""C14 `bpm:*` 요소에서 짓는 것 — bpmn-moddle 설명과 **속성 폼 명세**.

실행: `uv run python scripts/gen_moddle.py`
`--check`: 파일을 쓰지 않고 검사만 하며, 생성물이 모델과 다르면 1로 끝난다 (CI용).

bpmn-js가 우리 확장 요소를 **타입으로** 다루려면 설명이 필요하다 ([ADR-0022](../docs/decisions/0022-studio-canvas.md)).
**손으로 쓰지 않는다** — 원본은 `contracts.bpmn_ext.ELEMENT_MODELS`이고, `bpm:*`를 하나 더하면
여기를 다시 돌려야 CI가 통과한다.

**자리가 셋이다** (ADR-0143):

- 콘솔 웹 편집기: `server/web/packages/bpmn-canvas/src/moddle.ts` (ES 모듈)
- Qt Studio 캔버스: `studio/app/.../web/bpm-moddle.js` (전역 `window.BPM_MODDLE`) — 걷힐 자리다 (M11 조각 5)
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
QT = ROOT / "studio" / "app" / "src" / "bpm" / "studio" / "web" / "bpm-moddle.js"

#: XML 속성으로 적는 것 (나머지는 전부 본문 JSON이다). C14 §태스크 종류 표의 `bpm:task`.
XML_ATTRIBUTES: dict[str, tuple[str, ...]] = {"task": ("type", "extension")}

#: 요소의 **화면 이름** — 모델에는 한글이 없다. 데스크톱 Studio의 탭 이름을 그대로 옮겼다
#: (`studio/app/.../*_editor.py`의 `TAB_LABEL` — 그 파일들은 M11 조각 5에서 걷힌다).
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
    out: dict[str, object] = {}
    for name in sorted(ELEMENT_MODELS):
        schema = ELEMENT_MODELS[name].model_json_schema()
        required = set(schema.get("required", []))
        fields = []
        for field_name, spec in schema.get("properties", {}).items():
            # `schema` 칸은 계약 번호라 사람이 고치지 않는다 (C14 — 모델이 채운다).
            if field_name == "schema":
                continue
            field: dict[str, object] = {
                "name": field_name,
                "kind": _kind_of(spec),
                "required": field_name in required,
            }
            choices = ELEMENT_CHOICES.get((name, field_name))
            if choices:
                field["kind"] = "choice"
                field["choices"] = list(choices)
            help_text = spec.get("description")
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
        QT: f"{BANNER}window.BPM_MODDLE = {body};\n",
        FORMS: (
            f"{BANNER}"
            "\n"
            "/** 폼이 그릴 줄 아는 칸의 갈래. `json`은 **그리지 못하는 모양**이라 JSON 칸 하나로 보인다. */\n"
            'export type FieldKind = "text" | "number" | "bool" | "choice" | "list-text" | "map-text" | "json";\n'
            "\n"
            "export interface ElementField {\n"
            "  name: string;\n"
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
