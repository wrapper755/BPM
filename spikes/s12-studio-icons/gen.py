"""Studio 아이콘 시안·생성 (Gemini nano banana 2 = gemini-3.1-flash-image).

키는 환경변수 GEMINI_API_KEY에서만 읽는다. 제품 코드에서 import하지 않는다.
쓰는 법: python gen.py <출력.png> "<프롬프트>" [참고 이미지.png ...]
"""

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

MODEL = "gemini-3.1-flash-image"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def generate(out: Path, prompt: str, refs: list[Path]) -> None:
    parts: list[dict] = [{"text": prompt}]
    for ref in refs:
        data = base64.b64encode(ref.read_bytes()).decode("ascii")
        parts.append({"inline_data": {"mime_type": "image/png", "data": data}})
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "1:1"}},
    }
    request = urllib.request.Request(
        URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        answer = json.loads(response.read().decode("utf-8"))
    for part in answer["candidates"][0]["content"]["parts"]:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            out.write_bytes(base64.b64decode(inline["data"]))
            print(f"썼다: {out}")
            return
    raise SystemExit(f"그림이 없다: {json.dumps(answer)[:500]}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    generate(Path(sys.argv[1]), sys.argv[2], [Path(p) for p in sys.argv[3:]])
