"""어느 시험이 **서버 쪽**인가 — 화면 없는 쪽의 표시 (`server`).

서버(Center·서버 실행기·일꾼·서비스 앱)는 Linux에서만 돈다. **`tests/server/` 폴더가 그 목록이다**
(ADR-0129) — 그 안의 시험에는 `conftest.py`가 `server` 표시를 붙여 `pytest -m "not server"`로 뺄 수 있다.
다른 폴더(`shared`·`integration`)는 양쪽이다.

**CI의 Windows 잡은 걷었다** ([ADR-0144](../docs/decisions/0144-remove-the-pc-runner.md)) — 볼 클라이언트가
없다. **데스크톱 쪽 시험도 없다** (ADR-0143, M11 조각 5) — 그래도 `CLIENT_MODULES`는 남긴다:
화면을 끌고 오는 코드가 서버 시험에 다시 섞이는 것을 그때 바로 잡는다.
"""

from __future__ import annotations

from pathlib import Path

#: 시험이 사는 곳 — 공용·서버와 제품을 가로지르는 것 (ADR-0129).
FOLDERS = ("shared", "server", "integration")

#: 시험 파일이 없는 폴더 — 자료만 든다 (`fonts/`는 표본 PDF를 만드는 글꼴, M11 조각 5).
DATA_FOLDERS = ("fonts",)

#: 이 폴더의 시험이 서버 쪽이다.
SERVER_FOLDER = "server"

#: 서버 시험이 import하면 안 되는 것 — 화면을 끌고 오는 코드다.
CLIENT_MODULES = (
    "bpm.qt",
    "PySide6",
)


def is_server_side(path: Path) -> bool:
    """`tests/server/` 아래의 시험 파일인가."""
    return path.parent.name == SERVER_FOLDER and path.parent.parent.name == "tests"
