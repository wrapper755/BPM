"""요청 본문 읽기 — **한 자리다**.

전에는 C4(PC 실행기) 모듈에 살았다. PC 실행기를 걷으면서 갈 자리가 없어졌으므로 제 모듈로
뺀다 (ADR-0144) — 어느 API든 본문은 같은 규칙으로 읽는다.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import Request

from bpm.center.errors import ApiError
from bpm.center.settings import MAX_REQUEST_KB


async def read_json(request: Request) -> dict[str, Any]:
    """본문을 JSON 객체로. 너무 크면 413, JSON이 아니거나 객체가 아니면 422."""
    raw = await request.body()
    if len(raw) > MAX_REQUEST_KB * 1024:
        raise ApiError(413, "too_large", f"요청이 {MAX_REQUEST_KB} KB를 넘는다")
    try:
        body = json.loads(raw or b"{}")
    except ValueError as e:
        raise ApiError(422, "input_invalid", "본문이 JSON이 아니다") from e
    if not isinstance(body, dict):
        raise ApiError(422, "input_invalid", "본문의 최상위가 객체가 아니다")
    return body


__all__ = ["read_json"]
