"""C14 `bpm:*` 요소 → bpmn-moddle 설명.

실행: `uv run python scripts/gen_moddle.py`
`--check`: 파일을 쓰지 않고 검사만 하며, 생성물이 모델과 다르면 1로 끝난다 (CI용).

bpmn-js가 우리 확장 요소를 **타입으로** 다루려면 설명이 필요하다 ([ADR-0022](../docs/decisions/0022-studio-canvas.md)).
**손으로 쓰지 않는다** — 원본은 `contracts.bpmn_ext.ELEMENT_MODELS`이고, `bpm:*`를 하나 더하면
여기를 다시 돌려야 CI가 통과한다.

**자리가 둘이다** — 같은 설명을 두 꼴로 쓴다 (ADR-0143):

- 콘솔 웹 편집기: `server/web/packages/bpmn-canvas/src/moddle.ts` (ES 모듈)
- Qt Studio 캔버스: `studio/app/.../web/bpm-moddle.js` (전역 `window.BPM_MODDLE`) — 걷힐 자리다 (M11 조각 5)

속성 **본문은 JSON 텍스트 하나**다 (C14 기본 규칙 2) — 그래서 요소마다 `isBody` 속성 하나이고,
XML 속성을 따로 쓰는 것은 `bpm:task`의 `type`·`extension`뿐이다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from bpm.contracts.bpmn_ext import BPM_NS, ELEMENT_MODELS

# Windows 콘솔·파이프의 기본 코드페이지(cp949·cp1252)에서는 한글을 찍다 터진다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "server" / "web" / "packages" / "bpmn-canvas" / "src" / "moddle.ts"
QT = ROOT / "studio" / "app" / "src" / "bpm" / "studio" / "web" / "bpm-moddle.js"

#: XML 속성으로 적는 것 (나머지는 전부 본문 JSON이다). C14 §태스크 종류 표의 `bpm:task`.
XML_ATTRIBUTES: dict[str, tuple[str, ...]] = {"task": ("type", "extension")}

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


def rendered() -> dict[Path, str]:
    """자리마다 쓸 글 — 같은 설명이고 내보내는 꼴만 다르다."""
    body = json.dumps(descriptor(), ensure_ascii=False, indent=2)
    return {
        WEB: f"{BANNER}export const BPM_MODDLE = {body};\n",
        QT: f"{BANNER}window.BPM_MODDLE = {body};\n",
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
