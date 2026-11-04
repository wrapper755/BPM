"""어느 시험이 **서버 쪽**인가 — CI의 Windows 잡이 빼는 것 (ADR-0104).

서버(Center·서버 실행기·일꾼·서비스 앱)는 Linux에서만 돈다. **`tests/server/` 폴더가 그 목록이다**
(ADR-0129) — 그 안의 시험에는 `conftest.py`가 `server` 표시를 붙이고, Windows 잡은 `pytest -m "not server"`로
돈다. 다른 폴더(`shared`·`studio`·`bot`·`integration`)는 양쪽이다.

**엔진(`core`)은 서버로 두지 않는다** — PC BPM 프로세스는 실행 프로세스로 Windows에서 엔진을 돌린다.
**PC 쪽 코드가 걸린 시험도 서버로 두지 않는다** (`test_ci_scope.py`가 import로 본다): 서버 실행기 위임
시험은 PC를 진짜 자식 프로세스로 돌려 `integration/`에 있다.
"""

from __future__ import annotations

from pathlib import Path

#: 시험이 사는 곳 — 제품 셋과 공용, 제품을 가로지르는 것 (ADR-0129).
FOLDERS = ("shared", "server", "studio", "bot", "integration")

#: 이 폴더의 시험이 서버 쪽이다.
SERVER_FOLDER = "server"

#: 서버 시험이 import하면 안 되는 것 — PC에서 도는 코드다.
CLIENT_MODULES = (
    "bpm.bot_ui",
    "bpm.qt",
    "PySide6",
)


def is_server_side(path: Path) -> bool:
    """`tests/server/` 아래의 시험 파일인가."""
    return path.parent.name == SERVER_FOLDER and path.parent.parent.name == "tests"
