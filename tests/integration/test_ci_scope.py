"""서버 시험 표시가 거짓말하지 않는다 (`ci_scope.py`, ADR-0104).

표시를 잘못 붙이면 클라이언트 시험이 **Windows에서 조용히 빠진다** — 그래서 셋을 본다:
모든 시험이 폴더에 있는가, `tests/server/`의 파일이 PC에서 도는 코드를 import하지 않는가, CI가 정말 빼고 있는가.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from ci_scope import CLIENT_MODULES, DATA_FOLDERS, FOLDERS, SERVER_FOLDER, is_server_side

TESTS = Path(__file__).resolve().parents[1]
ROOT = TESTS.parent
SERVER_FILES = sorted(p.stem for p in (TESTS / SERVER_FOLDER).glob("test_*.py"))


def test_every_test_lives_in_a_folder() -> None:
    """`tests/` 바로 밑의 시험 파일은 어느 쪽인지 말하지 않는다 — 제품 폴더에 둔다 (ADR-0129)."""
    loose = sorted(p.name for p in TESTS.glob("test_*.py"))
    assert loose == [], f"폴더에 넣는다 ({', '.join(FOLDERS)}): {loose}"
    folders = [p.name for p in TESTS.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))]
    unknown = sorted(name for name in folders if name not in (*FOLDERS, *DATA_FOLDERS))
    assert unknown == [], f"모르는 시험 폴더 — ci_scope.FOLDERS에 더하거나 옮긴다: {unknown}"


def test_the_server_folder_is_what_gets_marked() -> None:
    assert SERVER_FILES, "서버 시험이 하나도 없다 — 폴더 이름이 바뀌었나"
    assert all(is_server_side(TESTS / SERVER_FOLDER / f"{name}.py") for name in SERVER_FILES)
    assert not is_server_side(TESTS / "shared" / "test_core_engine.py")


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


@pytest.mark.parametrize("name", SERVER_FILES)
def test_a_server_file_does_not_run_client_code(name: str) -> None:
    """화면을 끌고 오는 코드(Qt·PySide6)를 부르면 그 파일은 서버 쪽이 아니다 — 서버에 PySide6가 없다."""
    used = _imports(TESTS / SERVER_FOLDER / f"{name}.py")
    client = sorted(m for m in used if any(m == c or m.startswith(c + ".") for c in CLIENT_MODULES))
    assert client == [], f"{name}은 클라이언트 코드를 쓴다 — tests/server/에서 뺀다"


def test_the_marker_is_put_on_server_files(pytestconfig: pytest.Config) -> None:
    assert any("server:" in line for line in pytestconfig.getini("markers")), "pyproject에 표시를 등록한다"


def test_ci_runs_every_test_on_linux_only() -> None:
    """**Windows 잡은 걷었다** (ADR-0144) — 볼 클라이언트가 없다. Linux는 전부 돈다."""
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "uv run pytest\n" in workflow, "전부 돈다"
    assert "windows-latest" not in workflow, "Windows 잡은 없다"
    assert "matrix:" not in workflow, "OS 매트릭스가 없다"
